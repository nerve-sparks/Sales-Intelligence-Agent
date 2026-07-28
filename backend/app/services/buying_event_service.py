"""Turns raw Tavily web results into canonical BuyingEvents (brief sections
10, 11, 12).

Pipeline per company:
  1. Ask the LLM to read each candidate web result and decide whether it is a
     real, current, XSparks-relevant buying event for THIS company (not a
     same-name collision, not a generic industry article) - structured output
     per brief section 10.
  2. Canonicalise + deduplicate: multiple articles about the same real-world
     event (company announcement + PR wire pickup + industry report) collapse
     into ONE BuyingEvent with several evidence sources - never several scored
     signals (brief section 11).
  3. Score each unique event deterministically (brief section 12):
       event_score = base_strength x relevance x freshness x source_quality
                     x extraction_confidence x status_factor
     Corroborating sources raise confidence later (scoring engine) but never
     add another event score.

The LLM understands evidence; it never computes the final Lead Score.
"""

import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import scoring_config as cfg
from app.models import BuyingEvent
from app.services import llm_client, tavily_client

CHUNK_SIZE = 8
MAX_CONCURRENCY = 6
_STOPWORDS = {"the", "a", "an", "of", "for", "to", "and", "in", "on", "with", "its", "their"}
_WORD_RE = re.compile(r"[^a-z0-9 ]+")


# --------------------------------------------------------------------------
# Freshness / scoring math (brief section 12) - deterministic, no LLM.
# --------------------------------------------------------------------------
def freshness_factor(published_at: datetime | None, now: datetime) -> float:
    if published_at is None:
        return cfg.FRESHNESS_UNKNOWN_DATE
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_days = (now - published_at).days
    if age_days < 0:
        age_days = 0
    for upper, factor in cfg.FRESHNESS_BANDS:
        if age_days <= upper:
            return factor
    return cfg.FRESHNESS_OLDER


def compute_event_score(base_strength, relevance, freshness, source_quality, extraction_confidence, status_factor) -> float:
    return round(
        base_strength * relevance * freshness * source_quality * extraction_confidence * status_factor,
        2,
    )


# --------------------------------------------------------------------------
# Date parsing (Tavily "date" strings: "Jan 21, 2026" or "3 days ago")
# --------------------------------------------------------------------------
_RELATIVE_RE = re.compile(r"^(\d+)\s+(day|week|month|year)s?\s+ago$", re.IGNORECASE)
_RELATIVE_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}


def parse_event_date(raw: str | None, now: datetime) -> datetime | None:
    if not raw:
        return None
    raw = raw.strip()
    rel = _RELATIVE_RE.match(raw)
    if rel:
        from datetime import timedelta

        return now - timedelta(days=_RELATIVE_DAYS[rel.group(2).lower()] * int(rel.group(1)))
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# --------------------------------------------------------------------------
# Canonicalisation (brief section 11)
# --------------------------------------------------------------------------
def _stem(word: str) -> str:
    """Crude suffix-stripping so token-jaccard dedup isn't fooled by verb
    form/plural variance a less-consistent LLM (e.g. a smaller model)
    introduces across articles about the SAME real event - "acquired" vs
    "acquires" vs "acquisition" never share a raw token, which was
    empirically confirmed to let real duplicates (e.g. 4+ separate articles
    on one acquisition) slip past the 0.6 jaccard merge threshold. Not a real
    stemmer (no dictionary, no exceptions) - just enough to collapse the
    common English suffixes that show up in this specific comparison."""
    for suffix in ("ations", "ation", "ing", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def _normalise(text: str | None) -> str:
    if not text:
        return ""
    words = _WORD_RE.sub("", text.lower()).split()
    return " ".join(_stem(w) for w in words if w not in _STOPWORDS)


def canonical_key(company_id, event: dict, event_date: datetime | None) -> str:
    """Stable dedup key: same real event -> same key. Built from company +
    event_type + normalised subject/action/object + event month, hashed."""
    month = event_date.strftime("%Y-%m") if event_date else "unknown"
    parts = [
        str(company_id),
        event.get("event_type") or "",
        _normalise(event.get("canonical_subject")),
        _normalise(event.get("canonical_action")),
        _normalise(event.get("canonical_object")),
        month,
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:40]


# --------------------------------------------------------------------------
# LLM extraction (brief section 10)
# --------------------------------------------------------------------------
def _offering_summary(offering_profile: dict) -> str:
    """Compact-but-complete offering context for the LLM (brief item 12) - not
    just offering names: positioning, per-offering problems/tech/signals,
    global problems solved, relevant technologies, accelerators, and
    alternative-solution categories. Truncated so the prompt stays bounded."""
    p = offering_profile
    lines = []
    if p.get("positioning"):
        lines.append(f"Positioning: {p['positioning']}")
    for o in p.get("offerings", [])[:8]:
        parts = [o.get("name", "")]
        if o.get("problems_solved"):
            parts.append("solves " + ", ".join(o["problems_solved"][:4]))
        if o.get("technologies"):
            parts.append("tech " + ", ".join(o["technologies"][:4]))
        if o.get("buying_signals"):
            parts.append("signals " + ", ".join(o["buying_signals"][:4]))
        lines.append("- " + " | ".join(x for x in parts if x))
    if p.get("problems_solved"):
        lines.append("Problems solved: " + ", ".join(p["problems_solved"][:10]))
    if p.get("relevant_technologies"):
        lines.append("Relevant tech: " + ", ".join(p["relevant_technologies"][:10]))
    if p.get("accelerators"):
        lines.append("Accelerators: " + ", ".join(p["accelerators"][:6]))
    alts = [a.get("category", "") for a in p.get("alternative_solutions", []) if a.get("category")]
    if alts:
        lines.append("Alternative solution categories: " + ", ".join(alts[:8]))
    return "\n".join(lines) or "AI strategy, data, agents, automation, governance, managed AI ops"


def _build_prompt(company: dict, offering_profile: dict, items: list[dict], now: datetime) -> str:
    offerings = _offering_summary(offering_profile)
    item_lines = "\n".join(
        f"[{i}] title: {it.get('title')!r} | snippet: {it.get('snippet')!r} | "
        f"url: {it.get('url')} | published: {it.get('published_date')}"
        for i, it in enumerate(items)
    )
    event_types = ", ".join(sorted(cfg.BASE_STRENGTH.keys()))
    return (
        "You are a B2B buying-signal analyst for XSparks (an AI solutions/transformation partner). "
        f"Today is {now.strftime('%Y-%m-%d')}.\n\n"
        f"Company under analysis: {company.get('company_name')} "
        f"(domain: {company.get('company_domain')}, industry: {company.get('industry')}).\n\n"
        f"What XSparks sells:\n{offerings}\n\n"
        "For EACH web result below, decide whether it describes a REAL, CURRENT event for THIS "
        "specific company that a B2B sales team could act on. Reject ONLY: same-name different "
        "companies, generic industry articles not about this company, search-result/aggregator "
        "listing pages, job-board noise, and events clearly older than ~18 months. A funding round, "
        "new senior leader, acquisition/merger, expansion, or significant hiring IS an acceptable "
        "event - classify it and score its relevance per the anchors below; do NOT reject it just "
        "for lacking an explicit AI mention (these are legitimate prospecting triggers).\n\n"
        f"Allowed event_type values (choose the closest): {event_types}.\n"
        "event_category is one of: buying_stage, ai_seriousness, ai_pain_points, budget_and_capital, "
        "urgency_and_catalysts, competitive_context, company_identity, reachability.\n"
        "event_status: active | announced | exploring | speculative | completed_follow_on | completed_irrelevant.\n"
        "xsparks_relevance is 0.0-1.0. Anchors: 1.0 direct XSparks-solution match (active AI/data/"
        "automation need); 0.65 operational pain addressable by XSparks (inefficiency, quality, "
        "compliance, labour) OR a clear growth/change TRIGGER a solutions partner should act on - "
        "fresh funding, a new senior leader (CEO/CTO/CIO/CDO), an acquisition/merger, a major "
        "expansion, or significant hiring; 0.35 weak/indirect relevance; 0.0 truly irrelevant. Do "
        "NOT mark a real funding round, leadership change, acquisition, or expansion as 0.0/0.2 - "
        "these are legitimate prospecting triggers even without an explicit AI mention.\n"
        "is_negative=true for events that REDUCE buying likelihood; negative_type is one of: "
        "vendor_selected | relevant_project_completed | project_cancelled | severe_financial_distress "
        "| strong_contradictory_signal (else null).\n"
        "public_budget_usd: ONLY when the text explicitly ties a budget/funding figure to THIS "
        "programme or procurement (e.g. 'allocated $5M for its AI transformation'); the numeric USD "
        "amount, else null. NEVER use unrelated funding rounds, company valuation, revenue, or "
        "contract totals as a budget. budget_currency (e.g. 'USD') and budget_confidence "
        "(high|medium|low) only when public_budget_usd is set.\n"
        "canonical_subject/action/object are short normalised phrases identifying the real-world "
        "event so duplicate articles about the SAME event can be matched.\n\n"
        f"Web results:\n{item_lines}\n\n"
        "Respond with ONLY a JSON array, one object per result index, no prose or markdown:\n"
        '[{"index":0,"is_real_company_event":true,"event_type":"vendor_evaluation",'
        '"event_category":"buying_stage","event_summary":"","event_status":"active",'
        '"event_date":"2026-01-21","is_action":true,"xsparks_relevance":0.9,'
        '"best_offering":"AI Agents and Workflow Automation","relevance_reason":"",'
        '"extraction_confidence":0.88,"is_negative":false,"negative_type":null,'
        '"public_budget_usd":null,"budget_currency":null,"budget_confidence":null,'
        '"canonical_subject":"","canonical_action":"","canonical_object":""}]\n'
        "Set is_real_company_event=false for anything you reject; still include its index."
    )


def _parse(raw: str) -> dict[int, dict]:
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return {}
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {}
    out: dict[int, dict] = {}
    if isinstance(parsed, list):
        for obj in parsed:
            if isinstance(obj, dict) and isinstance(obj.get("index"), int):
                out[obj["index"]] = obj
    return out


def _clamp01(value, default=0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return max(0.0, min(1.0, float(value)))


def _clamp_budget(value) -> float | None:
    """A public AI/procurement budget the LLM extracted, or None. Rejects
    non-positive / non-numeric values so an absent budget never becomes 0."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value > 0 else None


async def _classify_chunk(
    company: dict, offering_profile: dict, items: list[dict], now: datetime, research_run_id=None,
) -> tuple[dict[int, dict], bool]:
    """Returns (classifications, ok). ok=False means the LLM was unavailable or
    returned an unparseable response - the caller must NOT treat that as
    'zero events' (brief item 7), since silently doing so would permanently
    mark a company researched with no evidence when the truth is 'not yet
    classified'."""
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _build_prompt(company, offering_profile, items, now)}],
            generation_name="extract-buying-events",
            temperature=0,
            # Langfuse session_id: every classification call made during ONE
            # research run (across however many companies/chunks) groups
            # together, mirroring how a chat session groups conversation
            # turns - lets you see one upload's full LLM activity as a unit.
            trace_id=str(research_run_id) if research_run_id else None,
            # Langfuse user_id: per-organisation cost/usage attribution -
            # this is the highest-volume call site in the app, so this is
            # where per-tenant DeepSeek cost tracking actually matters.
            trace_user_id=str(company["organisation_id"]) if company.get("organisation_id") else None,
        )
    except Exception:
        return {}, False  # LLM unavailable
    parsed = _parse(raw)
    if not parsed:
        return {}, False  # invalid / unparseable response
    return parsed, True


async def extract_events(
    company: dict, offering_profile: dict, evidence_items: list[dict], now: datetime, research_run_id=None,
) -> tuple[list[dict], dict]:
    """Classifies each evidence item. Returns (accepted, stats) where accepted
    is the XSparks-relevant events (each carrying its source evidence) and
    stats = {chunks_total, chunks_failed}. A successful classification that
    finds zero real events is DISTINCT from an LLM failure (item 7): the former
    has chunks_failed=0, the latter chunks_failed>0."""
    if not evidence_items:
        return [], {"chunks_total": 0, "chunks_failed": 0}
    chunks = [evidence_items[i : i + CHUNK_SIZE] for i in range(0, len(evidence_items), CHUNK_SIZE)]
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def run(chunk):
        async with semaphore:
            classes, ok = await _classify_chunk(company, offering_profile, chunk, now, research_run_id)
            return classes, ok, chunk

    accepted: list[dict] = []
    chunks_failed = 0
    for classes, ok, chunk in await asyncio.gather(*[run(c) for c in chunks]):
        if not ok:
            chunks_failed += 1
            continue
        for i, item in enumerate(chunk):
            cls = classes.get(i)
            if not cls or not cls.get("is_real_company_event"):
                continue
            event_type = cls.get("event_type")
            relevance = _clamp01(cls.get("xsparks_relevance"))
            if relevance <= 0.0 and not cls.get("is_negative"):
                continue  # irrelevant to XSparks and not a negative -> drop
            accepted.append({"cls": cls, "evidence": item, "event_type": event_type, "relevance": relevance})
    return accepted, {"chunks_total": len(chunks), "chunks_failed": chunks_failed}


# --------------------------------------------------------------------------
# Canonical grouping + scoring + persistence (brief sections 11, 12)
# --------------------------------------------------------------------------
def _build_canonical_events(company_id, accepted: list[dict], now: datetime) -> dict[str, dict]:
    """Groups accepted per-item classifications by canonical_key, then merges
    near-duplicate groups (item 9 hybrid dedup). Each surviving group becomes
    one BuyingEvent; representative multipliers come from the strongest single
    source, every source retained as evidence."""
    groups: dict[str, dict] = {}
    for entry in accepted:
        cls, item = entry["cls"], entry["evidence"]
        event_date = parse_event_date(cls.get("event_date") or item.get("published_date"), now)
        key = canonical_key(company_id, cls, event_date)

        is_negative = bool(cls.get("is_negative"))
        base_strength = cfg.BASE_STRENGTH.get(entry["event_type"], cfg.DEFAULT_BASE_STRENGTH)
        relevance = entry["relevance"]
        freshness = freshness_factor(event_date, now)
        source_quality = cfg.SOURCE_QUALITY.get(item.get("source_type"), cfg.DEFAULT_SOURCE_QUALITY)
        extraction_confidence = _clamp01(cls.get("extraction_confidence"), 0.75)
        status_factor = cfg.STATUS_FACTOR.get(cls.get("event_status"), cfg.DEFAULT_STATUS_FACTOR)
        event_score = compute_event_score(
            base_strength, relevance, freshness, source_quality, extraction_confidence, status_factor
        )
        penalty = cfg.NEGATIVE_PENALTY.get(cls.get("negative_type"), cfg.DEFAULT_NEGATIVE_PENALTY) if is_negative else None
        budget = _clamp_budget(cls.get("public_budget_usd"))

        candidate = {
            "canonical_key": key,
            "event_type": entry["event_type"],
            "category": cls.get("event_category"),
            "title": item.get("title"),
            "summary": cls.get("event_summary"),
            "published_at": event_date,
            "base_strength": base_strength,
            "relevance": relevance,
            "freshness": freshness,
            "source_quality": source_quality,
            "extraction_confidence": extraction_confidence,
            "status_factor": status_factor,
            "event_score": event_score,
            "is_negative": is_negative,
            "penalty_value": penalty,
            "best_offering": cls.get("best_offering"),
            "reasoning": cls.get("relevance_reason"),
            "company_match": item.get("company_match", 0.8),
            "public_budget_usd": budget,
            "budget_currency": cls.get("budget_currency") if budget else None,
            "budget_source_url": item.get("url") if budget else None,
            "budget_confidence": cls.get("budget_confidence") if budget else None,
            # dedup signals
            "_subject": _normalise(cls.get("canonical_subject")),
            "_action": _normalise(cls.get("canonical_action")),
            "_object": _normalise(cls.get("canonical_object")),
            "_date": event_date,
            "evidence": [item],
        }

        existing = groups.get(key)
        if existing is None:
            groups[key] = candidate
        else:
            _absorb(existing, candidate)
    return _merge_similar_groups(groups)


def _absorb(keeper: dict, other: dict) -> None:
    """Fold `other` into `keeper` (same real event): append evidence, keep the
    stronger-scored representative's multipliers, keep the larger budget."""
    keeper_evidence = keeper["evidence"]
    for e in other["evidence"]:
        if e.get("url") not in {ev.get("url") for ev in keeper_evidence}:
            keeper_evidence.append(e)
    if (other["event_score"] or 0) > (keeper["event_score"] or 0):
        for field in ("event_type", "category", "title", "summary", "published_at", "base_strength",
                      "relevance", "freshness", "source_quality", "extraction_confidence",
                      "status_factor", "event_score", "is_negative", "penalty_value", "best_offering",
                      "reasoning", "company_match", "_subject", "_action", "_object", "_date"):
            keeper[field] = other[field]
    if (other.get("public_budget_usd") or 0) > (keeper.get("public_budget_usd") or 0):
        keeper["public_budget_usd"] = other["public_budget_usd"]
        keeper["budget_currency"] = other["budget_currency"]
        keeper["budget_source_url"] = other["budget_source_url"]
        keeper["budget_confidence"] = other["budget_confidence"]
    keeper["evidence"] = keeper_evidence


def _token_jaccard(a: str, b: str) -> float:
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _dates_compatible(d1, d2) -> bool:
    """Same event can be reported across adjacent months, or with one source
    dateless (item 9). Compatible if within 45 days, or either is unknown."""
    if d1 is None or d2 is None:
        return True
    return abs((d1 - d2).days) <= 45


def _existing_event_topic(row: "BuyingEvent") -> str:
    """Normalised-token proxy for a STORED event, used only for cross-run
    fuzzy matching (below) - canonical_subject/action/object aren't persisted,
    so title + summary is the closest available stand-in."""
    return _normalise(f"{row.title or ''} {row.summary or ''}")


def _existing_event_date(row: "BuyingEvent"):
    d = row.published_at
    if d is not None and d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d


def _match_existing_event(candidate: dict, existing_rows: list) -> "BuyingEvent | None":
    """Cross-run counterpart to _merge_similar_groups (item 9): that function
    only catches synonymous-wording duplicates among events discovered in the
    SAME research run. Across separate runs, slightly different phrasing or a
    shifted date means the new event's exact canonical_key won't match a
    previously-stored row either, which would silently create a duplicate
    BuyingEvent instead of updating the existing one.

    Matches on company (caller already scopes existing_rows to one company) +
    event_type + is_negative, then either a shared evidence source URL (the
    strongest possible signal - literally the same article) or high
    topic-token overlap between title+summary, with compatible dates."""
    candidate_topic = _normalise(f"{candidate.get('title') or ''} {candidate.get('summary') or ''}")
    candidate_urls = {e.get("url") for e in candidate.get("evidence", []) if e.get("url")}
    candidate_date = candidate.get("published_at")
    if candidate_date is not None and candidate_date.tzinfo is None:
        candidate_date = candidate_date.replace(tzinfo=timezone.utc)

    for row in existing_rows:
        if row.event_type != candidate["event_type"] or row.is_negative != candidate["is_negative"]:
            continue
        if not _dates_compatible(_existing_event_date(row), candidate_date):
            continue
        shared_evidence = bool(candidate_urls & {e.get("url") for e in (row.evidence or []) if e.get("url")})
        topic_overlap = _token_jaccard(candidate_topic, _existing_event_topic(row))
        if shared_evidence or topic_overlap >= 0.6:
            return row
    return None


def _evidence_domains(ev: dict) -> set[str]:
    return {e.get("domain") for e in ev.get("evidence", []) if e.get("domain")}


def _merge_similar_groups(groups: dict[str, dict]) -> dict[str, dict]:
    """Second-pass hybrid merge (item 9): collapse groups that are the same
    real event under synonymous wording / adjacent dates - same event_type,
    high subject+action+object token similarity, and compatible dates - even
    when their exact canonical_key differed.

    Two merge paths, either sufficient: (a) the original subject+action+object
    similarity >=0.6, for near-identical phrasing; or (b) same event_type +
    same source domain + real ACTION/OBJECT overlap ((act+obj)/2 >=0.34), for
    the case an LLM (esp. a smaller/less consistent one) describes ONE real
    announcement differently across several pages of the SAME site - e.g. one
    product launch covered on a company's homepage, its video page, and its
    product-updates page, each phrased just differently enough to miss the 0.6
    bar. Path (b) keys on action+object, NOT subject: the subject is almost
    always just the company name (it overlaps for EVERY pair on that company),
    so keying on it would collapse genuinely distinct same-type announcements
    from a company's own press room (its acquisition AND its funding AND its
    launch) into one. Action+object ("acquired Aisera" vs "raised $200M" vs
    "launched IT solutions") is what actually distinguishes separate events, so
    requiring overlap there merges true duplicates while keeping distinct
    events distinct."""
    items = list(groups.items())
    merged: list[tuple[str, dict]] = []
    for key, ev in items:
        target = None
        ev_domains = _evidence_domains(ev)
        for _mkey, mev in merged:
            if mev["event_type"] != ev["event_type"] or mev["is_negative"] != ev["is_negative"]:
                continue
            if not _dates_compatible(mev["_date"], ev["_date"]):
                continue
            subj = _token_jaccard(mev["_subject"], ev["_subject"])
            act = _token_jaccard(mev["_action"], ev["_action"])
            obj = _token_jaccard(mev["_object"], ev["_object"])
            combined = (subj + act + obj) / 3
            same_domain = bool(ev_domains & _evidence_domains(mev))
            if combined >= 0.6 or (same_domain and (act + obj) / 2 >= 0.34):
                target = mev
                break
        if target is None:
            merged.append((key, ev))
        else:
            _absorb(target, ev)
    return {k: v for k, v in merged}


async def persist_company_events(
    session: AsyncSession, company_id, canonical_events: dict[str, dict], now: datetime, research_run_id,
    *, mark_missing_stale: bool = True,
) -> int:
    """Upserts canonical events for one company. On a repeat run an existing
    event's evidence sources are merged (corroboration), the strongest score
    kept, and last_seen_at/research_run_id refreshed (un-staled). Events NOT
    rediscovered this run are marked stale afterward (item 10) - but ONLY when
    mark_missing_stale is True, i.e. this run's research was fully successful
    (no Tavily failure, no failed LLM chunks). A partial/total LLM or Tavily
    failure means events genuinely still there may simply not have been
    re-classified this run; staling them on an incomplete run would be a false
    negative, so the caller (research_company) passes mark_missing_stale=False
    whenever anything failed - including when canonical_events ends up empty
    only because of that failure, not because there is truly nothing left."""
    existing_rows = (
        await session.execute(select(BuyingEvent).where(BuyingEvent.company_id == company_id))
    ).scalars().all()
    existing_by_key = {r.canonical_key: r for r in existing_rows}
    matched_existing_ids = set()

    stored = 0
    for key, ev in canonical_events.items():
        row = existing_by_key.get(key)
        if row is None:
            # Exact key missed - fall back to cross-run fuzzy matching (item 9
            # extended across runs) before assuming this is a genuinely new
            # event. Excludes rows already claimed by an earlier candidate in
            # this same loop, so two distinct new events can't both collapse
            # onto the same stored row.
            row = _match_existing_event(
                ev, [r for r in existing_rows if r.buying_event_id not in matched_existing_ids]
            )
        if row is not None:
            matched_existing_ids.add(row.buying_event_id)
        if row is None:
            session.add(
                BuyingEvent(
                    company_id=company_id,
                    canonical_key=key,
                    event_type=ev["event_type"],
                    category=ev["category"],
                    title=ev["title"],
                    summary=ev["summary"],
                    evidence=ev["evidence"],
                    published_at=ev["published_at"],
                    base_strength=ev["base_strength"],
                    relevance=ev["relevance"],
                    freshness=ev["freshness"],
                    source_quality=ev["source_quality"],
                    extraction_confidence=ev["extraction_confidence"],
                    status_factor=ev["status_factor"],
                    event_score=ev["event_score"],
                    is_negative=ev["is_negative"],
                    penalty_value=ev["penalty_value"],
                    best_offering=ev["best_offering"],
                    reasoning=ev["reasoning"],
                    public_budget_usd=ev["public_budget_usd"],
                    budget_currency=ev["budget_currency"],
                    budget_source_url=ev["budget_source_url"],
                    budget_confidence=ev["budget_confidence"],
                    first_seen_at=now,
                    last_seen_at=now,
                    research_run_id=research_run_id,
                    is_stale=False,
                )
            )
            stored += 1
        else:
            seen = {e.get("url") for e in (row.evidence or [])}
            merged = list(row.evidence or [])
            for e in ev["evidence"]:
                if e.get("url") not in seen:
                    merged.append(e)
                    seen.add(e.get("url"))
            row.evidence = merged
            if (ev["event_score"] or 0) > (float(row.event_score) if row.event_score is not None else 0):
                row.base_strength = ev["base_strength"]
                row.relevance = ev["relevance"]
                row.freshness = ev["freshness"]
                row.source_quality = ev["source_quality"]
                row.extraction_confidence = ev["extraction_confidence"]
                row.status_factor = ev["status_factor"]
                row.event_score = ev["event_score"]
            row.last_seen_at = now
            row.research_run_id = research_run_id
            row.is_stale = False
            row.updated_at = now

    # Rediscovery: any pre-existing event NOT seen in this run goes stale, so
    # it stops carrying buying influence while its evidence history is kept -
    # only when this run was fully successful (see mark_missing_stale above).
    # "Seen" includes rows reached only via the cross-run fuzzy fallback above
    # (matched_existing_ids) - their canonical_key never appears in
    # canonical_events' own keys, so checking seen_keys alone would wrongly
    # stale a row this run just updated.
    if mark_missing_stale:
        seen_keys = set(canonical_events.keys())
        for row in existing_rows:
            if row.canonical_key not in seen_keys and row.buying_event_id not in matched_existing_ids and not row.is_stale:
                row.is_stale = True
                row.updated_at = now
    return stored


async def research_company(
    session: AsyncSession, company: dict, offering_profile: dict, now: datetime, research_run_id
) -> dict:
    """Full per-company research->extract->canonicalise->score->persist. The
    caller owns the session/transaction. Returns a rich summary (item 7):
    distinguishes 'researched, zero events' from 'LLM/Tavily unavailable'."""
    domain = company["company_domain"]
    company_id = company["company_id"]
    retrieved_at = now.isoformat()

    # ONE Tavily Advanced Search call per company - a single broad query
    # covers both third-party coverage and the company's own site content
    # (see tavily_client module docstring), so this is one round trip per
    # company, not two, which matters multiplied by however many companies
    # run concurrently in search_signal_ingest.py.
    research_failed = False
    raw_results: list[dict] = []
    try:
        raw_results = await tavily_client.search(domain, company.get("company_name"))
    except Exception:
        research_failed = True

    query = tavily_client.build_query(domain, company.get("company_name"))
    evidence_items = []
    seen_urls = set()
    for item in raw_results:
        link = item.get("link")
        if not link or link in seen_urls:
            continue
        if not tavily_client.is_relevant(domain, company.get("company_name"), item):
            continue
        seen_urls.add(link)
        ev = tavily_client.to_evidence(item, query, "web", retrieved_at, company_domain=domain)
        ev["company_match"] = tavily_client.match_confidence(domain, company.get("company_name"), item)
        evidence_items.append(ev)

    accepted, stats = await extract_events(company, offering_profile, evidence_items, now, research_run_id)
    llm_failed = stats["chunks_failed"] > 0 and stats["chunks_failed"] == stats["chunks_total"]
    canonical_events = _build_canonical_events(company_id, accepted, now)
    # Only a run with NO Tavily failure and NO failed LLM chunks (partial or
    # total) is trustworthy enough to stale events this run didn't rediscover -
    # a partial/total failure means some still-current events may simply not
    # have been re-classified, not that they genuinely vanished.
    fully_successful = not research_failed and stats["chunks_failed"] == 0
    stored = await persist_company_events(
        session, company_id, canonical_events, now, research_run_id,
        mark_missing_stale=fully_successful,
    )
    # A company is "successfully researched" (safe to stamp fetched_at) only if
    # neither Tavily nor the LLM outright failed - otherwise it should be
    # retried, not permanently recorded as having no evidence (item 7).
    ok = not research_failed and not llm_failed
    return {
        "results_found": len(evidence_items),
        "events_accepted": len(accepted),
        "canonical_events": len(canonical_events),
        "events_stored": stored,
        "ok": ok,
        "research_failed": research_failed,
        "llm_failed": llm_failed,
        "partial_llm_failure": 0 < stats["chunks_failed"] < stats["chunks_total"],
    }
