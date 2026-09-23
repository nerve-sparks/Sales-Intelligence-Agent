"""Turns raw web results into canonical BuyingEvents (brief sections 10-12).

Pipeline per company:
  1. Ask the LLM to read each candidate web result and decide whether it is a
     real, current buying event for THIS company that is relevant to the
     tenant's *current* Offering Profile (not a same-name collision, not a
     generic industry article) - structured output per brief section 10.
  2. Canonicalise + deduplicate: multiple articles about the same real-world
     event (company announcement + PR wire pickup + industry report) collapse
     into ONE BuyingEvent with several evidence sources - never several scored
     signals (brief section 11).
  3. Score each unique event deterministically (brief section 12):
       event_score = base_strength x relevance x freshness x source_quality
                     x extraction_confidence x status_factor
     Corroborating sources raise confidence later (scoring engine) but never
     add another event score.

Relevance anchors are never hardcoded to a product line - they are derived
from the Offering Profile passed into every research call. The LLM
understands evidence; it never computes the final Lead Score.
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
from app.services import llm_client, you_client

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
        # A future date is not fresh evidence, it is a date we cannot trust -
        # almost always the extraction LLM inferring a year wrongly. Clamping to
        # 0 handed these FULL freshness (1.0): 24 live events were dated ahead of
        # today, one of them 2030-01-01, every one scoring as maximally fresh.
        # Treated as an unknown date instead, which is what it effectively is.
        return cfg.FRESHNESS_UNKNOWN_DATE
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
            parsed = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if parsed.year < cfg.MIN_PLAUSIBLE_EVENT_YEAR:
            # Not a real event date - almost always the LLM reading a founding
            # year, copyright year, or "Since 1926"-style tagline off a static
            # company-overview page. Treated as unknown, same as an
            # unparseable date, rather than trusted and stored.
            return None
        return parsed
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
def _seller_name(offering_profile: dict) -> str:
    name = (offering_profile.get("company") or "").strip()
    return name or "the seller"


def _offering_names(offering_profile: dict) -> list[str]:
    names = []
    for o in offering_profile.get("offerings") or []:
        name = (o.get("name") or "").strip() if isinstance(o, dict) else ""
        if name:
            names.append(name)
    return names


def _offering_summary(offering_profile: dict) -> str:
    """Compact-but-complete offering context for the LLM (brief item 12) - not
    just offering names: positioning, per-offering problems/tech/signals,
    global problems solved, relevant technologies, accelerators, and
    alternative-solution categories. Truncated so the prompt stays bounded.
    Never invents a product line - if the profile is empty, say so explicitly
    so the model cannot fall back to a hardcoded category list."""
    p = offering_profile
    lines = []
    seller = _seller_name(p)
    lines.append(f"Seller: {seller}")
    if p.get("positioning"):
        lines.append(f"Positioning: {p['positioning']}")
    for o in p.get("offerings", [])[:8]:
        if not isinstance(o, dict):
            continue
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
    alts = [a.get("category", "") for a in p.get("alternative_solutions", []) if isinstance(a, dict) and a.get("category")]
    if alts:
        lines.append("Alternative solution categories: " + ", ".join(alts[:8]))
    if len(lines) <= 1:
        return f"Seller: {seller}\n(No structured offerings available - score relevance conservatively.)"
    return "\n".join(lines)


def _flatten_offering_field(offering_profile: dict, field: str, *, limit: int) -> list[str]:
    """Every value of `field` (technologies / buying_signals / problems_solved)
    across the WHOLE profile - the top-level list plus every per-offering list -
    deduplicated and truncated. Feeds the dynamic per-tenant placeholders below,
    so "does this event match what {seller} sells" is answered against this
    tenant's actual words, never a generic notion of the field's name."""
    seen: list[str] = []
    for value in offering_profile.get(field) or []:
        if isinstance(value, str) and value.strip() and value not in seen:
            seen.append(value.strip())
    for o in offering_profile.get("offerings") or []:
        if not isinstance(o, dict):
            continue
        for value in o.get(field) or []:
            if isinstance(value, str) and value.strip() and value not in seen:
                seen.append(value.strip())
    return seen[:limit]


def _solution_type_guidance(seller: str, offering_profile: dict) -> str:
    """Anchors the "does this event involve something like what {seller}
    sells" event_type choices (explicit_solution_budget, technology_budget,
    transformation_program, pilot_program_announced, solution_adoption,
    generic_technology_assessment, new_tech_mandate, relevant_hiring) to this
    tenant's OWN technologies/buying_signals/problems_solved - injected as
    placeholders filled fresh per request - rather than leaving the model to
    apply them to any event that merely sounds technical. Without this, the
    fixed type NAMES read as generic "adopted some tech" buckets and the
    model reached for them on ANY tech-adjacent event regardless of the
    tenant, relying on seller_relevance alone to catch the mismatch
    downstream - this catches it at classification time instead, for the
    exact types where that mismatch matters most."""
    technologies = _flatten_offering_field(offering_profile, "technologies", limit=15) or _flatten_offering_field(
        offering_profile, "relevant_technologies", limit=15
    )
    buying_signals = _flatten_offering_field(offering_profile, "buying_signals", limit=12)
    problems = _flatten_offering_field(offering_profile, "problems_solved", limit=12)
    if not (technologies or buying_signals or problems):
        return (
            f"{seller}'s profile lists no specific technologies, buying signals, or problems "
            "solved, so none of the types below can be matched with confidence - classify any "
            "tech-adoption-shaped event as generic_technology_assessment or company_identity_update "
            "and keep seller_relevance at 0.0-0.35 rather than guessing what would count as a match."
        )
    tech_line = ", ".join(technologies) if technologies else "(none listed)"
    signals_line = ", ".join(buying_signals) if buying_signals else "(none listed)"
    problems_line = ", ".join(problems) if problems else "(none listed)"
    return (
        f"explicit_solution_budget, technology_budget, transformation_program, "
        f"pilot_program_announced, solution_adoption, generic_technology_assessment, and "
        f"new_tech_mandate apply ONLY when the event matches one of {seller}'s OWN technologies "
        f"({tech_line}), buying signals ({signals_line}), or problems solved ({problems_line}) - "
        "never a generic notion of 'technology', 'digital', or 'AI'. relevant_hiring applies only "
        f"to hiring for roles/skills matching that same list, not technical hiring in general. A "
        f"prospect adopting, budgeting for, or being mandated to use something NOT in {seller}'s "
        "own lists above does not qualify for any of these types, however technical it sounds - "
        "classify it as company_identity_update (or the closest non-technology type) and score its "
        "seller_relevance at 0.0-0.35, not higher."
    )


def _relevance_from_cls(cls: dict) -> float:
    """Accept the current seller_relevance field, or the legacy xsparks_relevance
    key still returned by older cached prompts / tests."""
    raw = cls.get("seller_relevance")
    if raw is None:
        raw = cls.get("xsparks_relevance")
    return _clamp01(raw)


def _build_prompt(company: dict, offering_profile: dict, items: list[dict], now: datetime) -> str:
    seller = _seller_name(offering_profile)
    offerings = _offering_summary(offering_profile)
    offering_names = _offering_names(offering_profile)
    offering_names_line = (
        ", ".join(f'"{n}"' for n in offering_names[:12])
        if offering_names
        else "(none listed - leave best_offering null)"
    )
    example_offering = offering_names[0] if offering_names else None
    item_lines = "\n".join(
        f"[{i}] title: {it.get('title')!r} | snippet: {it.get('snippet')!r} | "
        f"url: {it.get('url')} | published: {it.get('published_date')}"
        for i, it in enumerate(items)
    )
    event_types = ", ".join(sorted(cfg.BASE_STRENGTH.keys()))
    solution_type_guidance = _solution_type_guidance(seller, offering_profile)
    return (
        f"You are a B2B buying-signal analyst for {seller}. "
        f"Today is {now.strftime('%Y-%m-%d')}.\n\n"
        f"Company under analysis: {company.get('company_name')} "
        f"(domain: {company.get('company_domain')}, industry: {company.get('industry')}).\n\n"
        f"What {seller} sells (the ONLY product/service context you may use for relevance):\n"
        f"{offerings}\n\n"
        "For EACH web result below, decide whether it describes a REAL, CURRENT event for THIS "
        "specific company that a B2B sales team could act on. Reject ONLY: same-name different "
        "companies, generic industry articles not about this company, search-result/aggregator "
        "listing pages, job-board noise, and events clearly older than ~18 months. A funding round, "
        "new senior leader, acquisition/merger, expansion, or significant hiring MAY be a real "
        "event worth classifying - but its seller_relevance must still be judged against what "
        f"{seller} sells above, not treated as automatically relevant.\n\n"
        "event_date is the date THIS SPECIFIC EVENT happened or was reported - never the company's "
        "founding year, a copyright year, or an encyclopedia/asset-profile page's last-updated stamp. "
        "A static \"About Us\", company-overview, directory listing, or historical-background page "
        "(e.g. \"Since 1926\", \"Founded in 1883\") has NO event date at all - set event_date to null "
        "for it rather than guessing a year found on the page, even if that means most such pages "
        "score as event_type company_identity_update with no date.\n\n"
        f"Allowed event_type values (choose the closest): {event_types}.\n"
        f"{solution_type_guidance}\n\n"
        f"event_category is one of: {', '.join(cfg.EVENT_CATEGORIES)}.\n"
        "event_status: active | announced | exploring | speculative | completed_follow_on | completed_irrelevant.\n"
        f"seller_relevance is 0.0-1.0 judged ONLY against what {seller} sells above. Anchors:\n"
        "- 1.0: event shows an active need that directly matches a SPECIFIC listed offering "
        "(names or clearly implies one of its own problems_solved, technologies, or buying_signals).\n"
        "- 0.65: event creates a credible buying opportunity for a specific listed offering - a "
        "concrete operational pain, or a buying_signal from the profile, that maps to one "
        "particular offering's own problems_solved/technologies, not the seller's business in general.\n"
        "- 0.35: weak or indirect connection to the listed offerings.\n"
        f"- 0.0: no meaningful connection to what {seller} sells - including generic funding, "
        "leadership changes, acquisitions, expansions, hiring, security incidents, or any other "
        "routine company event that does NOT map to a specific offering's own problems_solved, "
        "technologies, or buying_signals.\n"
        "Do NOT inflate relevance for growth triggers unrelated to the offerings above. "
        "Do NOT use any product category that is not in the profile.\n"
        f"CRITICAL - a broadly-worded division or capability of {seller} (e.g. 'digital services', "
        "'technology solutions', 'IT infrastructure') is NOT itself a listed offering: if the "
        "profile only names a division in general terms rather than a specific problems_solved/"
        "technologies/buying_signals match, treat any event needing that leap as 0.0-0.35, never "
        "higher. Prospect X doing something 'tech-related' (adopting AI, raising funding, a data "
        "breach, hiring engineers) is NOT evidence prospect X needs THIS SELLER's specific "
        f"offering, unless the event explicitly describes needing what {seller} lists, not merely "
        "something in the same broad field.\n"
        f"best_offering must be exactly one of these offering names, or null if none fit: "
        f"{offering_names_line}.\n"
        "is_negative=true for events that REDUCE buying likelihood for this seller; negative_type is one of: "
        "vendor_selected | relevant_project_completed | project_cancelled | severe_financial_distress "
        "| strong_contradictory_signal (else null).\n"
        "public_budget_usd: ONLY when the text explicitly ties a budget/funding figure to a "
        "programme or procurement relevant to the offerings above; the numeric USD amount, else null. "
        "NEVER use unrelated funding rounds, company valuation, revenue, or contract totals as a "
        "budget. budget_currency (e.g. 'USD') and budget_confidence (high|medium|low) only when "
        "public_budget_usd is set.\n"
        "canonical_subject/action/object identify the REAL-WORLD EVENT, not this article's angle on "
        "it, so that separate articles about one event collapse into one scored event instead of "
        "several. Describe what happened in the most neutral, generic phrasing you can, and phrase "
        "it IDENTICALLY for every result covering that same happening - ignore which detail each "
        "headline chose to lead on. Worked example: 'Acme falls after weak guidance', 'Acme Q3 "
        "earnings call transcript' and 'Acme expects $155M revenue as delays bite' are ONE event, "
        "and all three must emit exactly subject='Acme', action='reported', object='Q3 2026 "
        "earnings' - NOT 'falls after', 'held earnings call', 'expects $155M', which would read as "
        "three unrelated events. Reuse the same object wording rather than inventing a per-article "
        "variant.\n\n"
        f"Web results:\n{item_lines}\n\n"
        "Respond with ONLY a JSON array, no prose or markdown. Emit ONE OBJECT PER DISTINCT REAL "
        "EVENT, with `index` naming the web result it came from. IMPORTANT: a single result often "
        "covers MANY separate events - a newsroom or press-release listing page can carry dozens - "
        "and each one needs its own object, all sharing that result's index. Do not stop after the "
        "first event you find in a result, and do not merge several events from one result into a "
        "single object. Conversely, do not split one event into several objects just because a "
        "result describes it at length.\n"
        '[{"index":0,"is_real_company_event":true,"event_type":"vendor_evaluation",'
        '"event_category":"buying_stage","event_summary":"","event_status":"active",'
        '"event_date":"2026-01-21","is_action":true,"seller_relevance":0.9,'
        f'"best_offering":{json.dumps(example_offering)},"relevance_reason":"",'
        '"extraction_confidence":0.88,"is_negative":false,"negative_type":null,'
        '"public_budget_usd":null,"budget_currency":null,"budget_confidence":null,'
        '"canonical_subject":"","canonical_action":"","canonical_object":""}]\n'
        "A result carrying no real event at all still gets exactly one object, with "
        "is_real_company_event=false. Every index must appear at least once."
    )


def _parse(raw: str) -> dict[int, list[dict]]:
    """Groups the model's classification objects by the evidence index they
    came from. A LIST per index, not one object: a single web result routinely
    describes several distinct events (a newsroom or press-release listing page
    carries dozens), and the previous one-object-per-index mapping silently
    discarded all but the last of them - so the richest source in a result set
    could only ever yield a single event no matter how much it contained."""
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return {}
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {}
    out: dict[int, list[dict]] = {}
    if isinstance(parsed, list):
        for obj in parsed:
            if isinstance(obj, dict) and isinstance(obj.get("index"), int):
                out.setdefault(obj["index"], []).append(obj)
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
    company_name = company.get("company_name")
    print(f"[LLM] >>> Classifying {len(items)} evidence item(s) for '{company_name}' "
          f"(provider order: BridgeLLM -> DeepSeek -> Ollama)...")
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
    except Exception as exc:
        print(f"[LLM] <<< FAILED for '{company_name}': {type(exc).__name__}: {exc}")
        return {}, False  # LLM unavailable
    print(f"[LLM] <<< Raw response for '{company_name}' ({len(raw)} chars): {raw[:300]!r}"
          f"{'...' if len(raw) > 300 else ''}")
    parsed = _parse(raw)
    if not parsed:
        print(f"[LLM] <<< UNPARSEABLE response for '{company_name}' - treating as failure, not zero-events")
        return {}, False  # invalid / unparseable response
    flat = [c for classes in parsed.values() for c in classes]
    accepted_ct = sum(1 for c in flat if c.get("is_real_company_event"))
    print(f"[LLM] <<< Parsed {len(flat)} classification(s) across {len(parsed)} result(s) for "
          f"'{company_name}': {accepted_ct} accepted as real events, {len(flat) - accepted_ct} rejected")
    return parsed, True



# Deterministic safety net for the single highest-stakes classification in
# the pipeline: whether a company is going under. Confirmed live (Luminar
# Technologies, 2026-07-29): the LLM classified an article titled "...Initiates
# Voluntary Chapter 11 Proceedings..." as a POSITIVE vendor_evaluation event,
# with zero negative events extracted - the company then scored 66.48 and
# showed "Sales Ready" while in active bankruptcy. temperature=0 does not
# guarantee this can't recur (confirmed: the same real Luminar facts were
# correctly read as severe_financial_distress in an earlier run and missed
# entirely in this one). Rather than trust LLM judgment alone for this one
# outcome, unambiguous distress language in the SOURCE text (not the LLM's
# possibly-softened summary) forces is_negative regardless of what the model
# said - a false positive here costs some Buying Evidence; a false negative
# recommends pursuing a company that may no longer exist.
_FORCED_NEGATIVE_PATTERNS = (
    "chapter 11", "chapter 7 bankruptcy", "bankrupt", "insolvent", "insolvency",
    "ceased operations", "ceased trading", "wind down", "winding down", "wound down",
    "liquidation", "liquidating", "dissolved", "effectively collapsed", "has collapsed",
)


def _forced_negative_reason(item: dict) -> str | None:
    """Returns the matched distress phrase if the evidence item's own title/
    snippet contains unambiguous company-distress language, else None. Checks
    the SOURCE text, not the LLM's summary - the LLM's own wording is exactly
    what's unreliable here."""
    haystack = f"{item.get('title') or ''} {item.get('snippet') or ''}".lower()
    for pattern in _FORCED_NEGATIVE_PATTERNS:
        if pattern in haystack:
            return pattern
    return None


async def extract_events(
    company: dict, offering_profile: dict, evidence_items: list[dict], now: datetime, research_run_id=None,
) -> tuple[list[dict], dict]:
    """Classifies each evidence item. Returns (accepted, stats) where accepted
    is the offering-profile-relevant events (each carrying its source evidence)
    and stats = {chunks_total, chunks_failed}. A successful classification that
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
            # One evidence item can yield SEVERAL events (see _parse) - e.g. a
            # newsroom page listing an acquisition, a leadership hire and a
            # product launch. Each becomes its own candidate event, all sharing
            # this item as their source evidence; canonical grouping downstream
            # is what collapses any that turn out to be the same real event.
            for cls in classes.get(i, ()):
                if not cls.get("is_real_company_event"):
                    continue

                forced_reason = _forced_negative_reason(item)
                if forced_reason and not cls.get("is_negative"):
                    print(f"[SAFETY-NET] Overriding LLM: '{item.get('title')}' contains distress "
                          f"phrase {forced_reason!r} but was classified non-negative - forcing "
                          f"is_negative=True, negative_type=severe_financial_distress")
                    cls = {**cls, "is_negative": True, "negative_type": "severe_financial_distress"}

                event_type = cls.get("event_type")
                relevance = _relevance_from_cls(cls)
                if relevance <= 0.0 and not cls.get("is_negative"):
                    continue  # irrelevant to this seller's offerings and not a negative -> drop
                accepted.append({"cls": cls, "evidence": item, "event_type": event_type, "relevance": relevance})
    return accepted, {"chunks_total": len(chunks), "chunks_failed": chunks_failed}


# --------------------------------------------------------------------------
# Canonical grouping + scoring + persistence (brief sections 11, 12)
# --------------------------------------------------------------------------
def _match_best_offering(raw, offering_profile: dict) -> str | None:
    """Force best_offering to an exact name from the live Offering Profile.
    The LLM often invents labels (industry, seller name, old product lines) -
    those must never land on BuyingEvent / LeadScore."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    names = _offering_names(offering_profile)
    if not names:
        return None
    by_lower = {n.lower(): n for n in names}
    if text.lower() in by_lower:
        return by_lower[text.lower()]
    # Allow near-match when the model appends fluff around a real name.
    for name in names:
        if name.lower() in text.lower() or text.lower() in name.lower():
            return name
    return None


def _build_canonical_events(
    company_id, accepted: list[dict], now: datetime, offering_profile: dict | None = None,
) -> dict[str, dict]:
    """Groups accepted per-item classifications by canonical_key, then merges
    near-duplicate groups (item 9 hybrid dedup). Each surviving group becomes
    one BuyingEvent; representative multipliers come from the strongest single
    source, every source retained as evidence."""
    profile = offering_profile or {}
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
            "best_offering": _match_best_offering(cls.get("best_offering"), profile),
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
    return _suppress_positive_duplicates_of_negative(_merge_similar_groups(groups))


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


def _suppress_positive_duplicates_of_negative(groups: dict[str, dict]) -> dict[str, dict]:
    """Drops a positive event that describes the SAME real-world fact as an
    already-present negative event (e.g. a distressed-sale/bankruptcy asset
    disposal read once as a "vendor evaluation" growth opportunity and once
    as "severe financial distress" - confirmed live: Luminar Technologies'
    $110M photonics-division sale to Quantum Computing Inc. was extracted as
    both, from two different source pages, in opposite polarities).

    Deliberately crosses the positive/negative boundary that
    _merge_similar_groups refuses to cross (there, same-polarity is required
    because collapsing a positive and negative read into ONE record would
    hide the conflict; here, the negative read is kept as the authoritative
    one and the positive duplicate is dropped entirely, rather than merged -
    a bankruptcy-driven divestiture should not also count as an independent
    growth signal toward Buying Evidence).

    Matched by shared evidence URL (the strongest possible signal) OR real
    ACTION+OBJECT overlap - never subject, which is almost always just the
    company name and would over-match every unrelated event pair for the
    same company (same reasoning as _merge_similar_groups' domain path).
    Cross-polarity framings diverge more in wording than same-polarity
    duplicates do (compare "sale of photonics business" vs "severe financial
    distress" for the identical transaction), so this uses a looser
    threshold (0.30) than the 0.34 same-polarity/same-domain path - a
    heuristic, not exact, and worth revisiting if it over- or under-fires in
    practice."""
    positives = [(k, v) for k, v in groups.items() if not v["is_negative"]]
    negatives = [v for v in groups.values() if v["is_negative"]]
    if not positives or not negatives:
        return groups

    suppressed: set[str] = set()
    for key, pos in positives:
        pos_urls = {e.get("url") for e in pos.get("evidence", []) if e.get("url")}
        for neg in negatives:
            if not _dates_compatible(pos["_date"], neg["_date"]):
                continue
            shared_evidence = bool(pos_urls & {e.get("url") for e in neg.get("evidence", []) if e.get("url")})
            act = _token_jaccard(pos["_action"], neg["_action"])
            obj = _token_jaccard(pos["_object"], neg["_object"])
            if shared_evidence or (act + obj) / 2 >= 0.30:
                suppressed.add(key)
                break
    return {k: v for k, v in groups.items() if k not in suppressed}


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
            # Always apply this run's classification. Relevance / best_offering
            # are judged against the *current* Offering Profile — keeping an
            # older higher score would leave companies ranked against a stale
            # offering after a re-upload or profile refresh.
            row.base_strength = ev["base_strength"]
            row.relevance = ev["relevance"]
            row.freshness = ev["freshness"]
            row.source_quality = ev["source_quality"]
            row.extraction_confidence = ev["extraction_confidence"]
            row.status_factor = ev["status_factor"]
            row.event_score = ev["event_score"]
            row.is_negative = ev["is_negative"]
            row.penalty_value = ev["penalty_value"]
            row.best_offering = ev["best_offering"]
            row.reasoning = ev["reasoning"]
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
    # (see you_client module docstring), so this is one round trip per
    # company, not two, which matters multiplied by however many companies
    # run concurrently in search_signal_ingest.py.
    research_failed = False
    raw_results: list[dict] = []
    try:
        raw_results = await you_client.search(
            domain, company.get("company_name"), location=company.get("location")
        )
    except Exception:
        research_failed = True

    query = you_client.build_query(domain, company.get("company_name"), company.get("location"))
    evidence_items = []
    seen_urls = set()
    for item in raw_results:
        link = item.get("link")
        if not link or link in seen_urls:
            continue
        if not you_client.is_relevant(domain, company.get("company_name"), item):
            continue
        seen_urls.add(link)
        ev = you_client.to_evidence(item, query, "web", retrieved_at, company_domain=domain)
        ev["company_match"] = you_client.match_confidence(domain, company.get("company_name"), item)
        evidence_items.append(ev)

    accepted, stats = await extract_events(company, offering_profile, evidence_items, now, research_run_id)
    llm_failed = stats["chunks_failed"] > 0 and stats["chunks_failed"] == stats["chunks_total"]
    canonical_events = _build_canonical_events(company_id, accepted, now, offering_profile)
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
