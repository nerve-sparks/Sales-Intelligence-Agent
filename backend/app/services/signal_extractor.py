import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, CompanyNews, CompanyScoop, Signal, SignalExtractionCheck
from app.services import llm_client, signal_llm

# classify_news' generic catch-all - a news row that only lands here is the
# vague stuff keyword rules can't place, so it's the LLM's to read (see
# _extract_news_signals).
NEWS_FALLBACK_TYPE = "technology_assessment"


@dataclass
class _Resolved:
    """One row's fully-resolved classification (from either the keyword
    fast-path or the LLM), ready for scoring + insert in phase 2."""

    signal_type: str
    extraction_confidence: float
    is_action: bool
    core_fact: str | None
    dollar_value_usd: float | None
    method: str  # "rule_based" | "llm" - stored on Signal.extraction_method

SIGNAL_CATEGORY_MAP = {
    "ai_engineer_job_posting": "ai_seriousness",
    "ai_budget_announcement": "ai_seriousness",
    "ai_tool_adoption": "ai_seriousness",
    "ai_partnership_signed": "ai_seriousness",
    "ai_pilot_announced": "ai_seriousness",
    "ai_transformation_program": "ai_seriousness",
    "operational_inefficiency": "ai_pain_points",
    "quality_control_issue": "ai_pain_points",
    "supply_chain_disruption": "ai_pain_points",
    "labour_shortage": "ai_pain_points",
    "cost_pressure_mentioned": "ai_pain_points",
    "compliance_burden": "ai_pain_points",
    "rfp_published": "buying_stage",
    "procurement_signal": "buying_stage",
    "vendor_evaluation_mentioned": "buying_stage",
    "pilot_in_progress": "buying_stage",
    "contract_awarded": "buying_stage",
    "technology_assessment": "buying_stage",
    "pe_investment_received": "budget_and_capital",
    "funding_round_announced": "budget_and_capital",
    "government_contract_awarded": "budget_and_capital",
    "tech_budget_announced": "budget_and_capital",
    "acquisition_completed": "budget_and_capital",
    "ipo_filed": "budget_and_capital",
    "ceo_change": "urgency_and_catalysts",
    "cto_change": "urgency_and_catalysts",
    "cfo_change": "urgency_and_catalysts",
    "leadership_mandate_announced": "urgency_and_catalysts",
    "competitor_ai_adoption": "urgency_and_catalysts",
    "regulatory_change": "urgency_and_catalysts",
    "plant_expansion": "urgency_and_catalysts",
    "merger_announced": "urgency_and_catalysts",
    "existing_vendor_mentioned": "competitive_context",
    "vendor_replacement_signal": "competitive_context",
    "greenfield_opportunity": "competitive_context",
    "competitive_evaluation": "competitive_context",
    "employee_count_update": "company_identity",
    "revenue_update": "company_identity",
    "ownership_change": "company_identity",
    "subsidiary_relationship": "company_identity",
    "headquarters_update": "company_identity",
    "cto_identified": "reachability",
    "cfo_identified": "reachability",
    "vp_operations_identified": "reachability",
    "it_director_identified": "reachability",
    "procurement_contact_identified": "reachability",
    "board_member_identified": "reachability",
}

def _dollar_value_signal_types() -> set[str]:
    return {t for t, category in SIGNAL_CATEGORY_MAP.items() if category == "budget_and_capital"}


# Only these signal_types get a dollar_value_usd from the article text - a
# $ figure in, say, a ceo_change or ai_tool_adoption headline is usually an
# incidental mention (valuation, market cap, unrelated number), not an
# actual deal-size signal. Feeding that into lead_scorer._expected_deal_value's
# Tier 1 weighted average silently inflated Expected Deal Value (e.g. a
# funding-round-only case that should fall through to Tier 2/3 instead
# picking up a stray valuation figure from an unrelated article).
DOLLAR_VALUE_SIGNAL_TYPES = _dollar_value_signal_types()

NEWS_KEYWORD_RULES = [
    ("funding_round_announced", ["raised", "series a", "series b", "series c", "closed funding", "growth equity", "investment round"]),
    ("government_contract_awarded", ["government contract", "awarded contract", "doe contract", "usaf contract", "army contract", "defense contract", "sole-source"]),
    ("ceo_change", ["new ceo", "appointed ceo", "chief executive officer"]),
    ("cto_change", ["new cto", "appointed cto", "chief technology officer"]),
    ("cfo_change", ["new cfo", "appointed cfo", "chief financial officer"]),
    ("leadership_mandate_announced", ["chief ai officer", "hires ai officer", "appointed ai officer", "chief digital officer"]),
    ("ai_tool_adoption", ["deployed ai", "launched ai", "integrated ai", "ai platform", "ai-powered"]),
    ("ai_budget_announcement", ["ai investment", "ai budget", "investing in ai", "ai initiative"]),
    ("ai_partnership_signed", ["partnership", "partnered with", "signed agreement", "strategic partnership"]),
    ("rfp_published", ["rfp", "request for proposal", "issued rfp"]),
    ("plant_expansion", ["expanding", "new facility", "new plant", "expansion", "sq ft"]),
    ("ai_pilot_announced", ["predictive maintenance", "pilot", "proof of concept"]),
    ("ai_transformation_program", ["digital transformation", "industry 4.0", "smart factory"]),
    ("tech_budget_announced", ["tech budget", "technology investment", "it investment"]),
]

ACTION_WORDS = [
    "raised", "signed", "hired", "awarded", "deployed", "launched",
    "closed", "secured", "appointed", "shipped", "integrated", "won", "published",
]
STATEMENT_WORDS = [
    "plans to", "considering", "exploring", "announced plans",
    "intends to", "looking to", "evaluating", "expects to",
]

DOLLAR_RE = re.compile(r"\$[\d,]+\.?\d*\s*[MBK]?", re.IGNORECASE)
ARTICLE_WORDS = {"a", "an", "the"}

SCOOP_TOPIC_RULES = {
    "facilities relocation/expansion": ("plant_expansion", False),
    "vendor evaluation": ("vendor_evaluation_mentioned", False),
    "rfp published": ("rfp_published", True),
    "new partnership/agreement": ("ai_partnership_signed", True),
    "government contract award": ("government_contract_awarded", True),
    "new contract": ("contract_awarded", True),
    "award": ("leadership_mandate_announced", False),
}
SKIP_SCOOP_TOPICS = {"events"}


def _clean_words(value: str) -> list[str]:
    lowered = value.lower()
    no_punct = re.sub(r"[^\w\s]", "", lowered)
    return [w for w in no_punct.split() if w not in ARTICLE_WORDS]


def extract_core_fact(value: str | None) -> str | None:
    if not value:
        return None
    return " ".join(_clean_words(value)[:10])


def extract_dollar_value(value: str | None) -> float | None:
    if not value:
        return None
    match = DOLLAR_RE.search(value)
    if not match:
        return None
    raw = match.group().upper().replace("$", "").replace(",", "").strip()
    multiplier = 1
    if raw.endswith("M"):
        multiplier, raw = 1_000_000, raw[:-1]
    elif raw.endswith("B"):
        multiplier, raw = 1_000_000_000, raw[:-1]
    elif raw.endswith("K"):
        multiplier, raw = 1_000, raw[:-1]
    raw = raw.strip()
    if not raw:
        return None
    return float(raw) * multiplier


def classify_news(title: str | None, description: str | None) -> tuple[str, float]:
    combined = f"{title or ''} {description or ''}".lower()
    for signal_type, keywords in NEWS_KEYWORD_RULES:
        if any(kw in combined for kw in keywords):
            return signal_type, 0.85
    return "technology_assessment", 0.60


def classify_is_action_news(title: str | None) -> bool:
    title_lower = (title or "").lower()
    if any(w in title_lower for w in ACTION_WORDS):
        return True
    if any(w in title_lower for w in STATEMENT_WORDS):
        return False
    return False


def _classify_leadership_change(description: str | None) -> str:
    d = (description or "").lower()
    if "ceo" in d or "chief executive" in d:
        return "ceo_change"
    if "cto" in d or "chief technology" in d:
        return "cto_change"
    if "cfo" in d or "chief financial" in d:
        return "cfo_change"
    if "chief ai" in d or "ai officer" in d:
        return "leadership_mandate_announced"
    return "leadership_mandate_announced"


def _classify_hiring(description: str | None) -> str:
    d = (description or "").lower()
    if any(k in d for k in ("ai", "machine learning", "robotics", "engineer")):
        return "ai_engineer_job_posting"
    return "labour_shortage"


def classify_scoop(topics, description: str | None) -> tuple[str, bool] | None:
    if not topics:
        return None
    topic = (topics[0].get("topic") or "").strip().lower()
    if topic in SKIP_SCOOP_TOPICS:
        return None
    if topic == "leadership change":
        return _classify_leadership_change(description), False
    if topic == "hiring":
        return _classify_hiring(description), True
    if topic in SCOOP_TOPIC_RULES:
        return SCOOP_TOPIC_RULES[topic]
    return None


def compute_m4(is_action: bool) -> float:
    return 1.10 if is_action else 0.80


def compute_m3(source_date) -> float:
    if source_date is None:
        return 0.20
    now = datetime.now(timezone.utc)
    if source_date.tzinfo is None:
        source_date = source_date.replace(tzinfo=timezone.utc)
    age_days = (now - source_date).days
    if age_days < 180:
        return 1.00
    if age_days < 360:
        return 0.80
    if age_days < 540:
        return 0.60
    if age_days < 720:
        return 0.40
    return 0.20


def compute_signal_confidence(m2: float, m3: float, m4: float) -> float:
    value = m2 * m3 * m4
    value = max(0.0, min(1.0, value))
    return round(value, 2)


async def _compute_m2(session: AsyncSession, company_id, signal_type: str) -> float:
    stmt = select(func.count(func.distinct(Signal.original_source))).where(
        Signal.company_id == company_id,
        Signal.signal_type == signal_type,
        Signal.ingested_at > text("now() - interval '30 days'"),
    )
    count = (await session.execute(stmt)).scalar() or 0
    return 1.15 if count >= 1 else 1.00


async def _insert_signal(session: AsyncSession, values: dict) -> bool:
    stmt = (
        pg_insert(Signal)
        .values(**values)
        .on_conflict_do_nothing(index_elements=["original_source"])
        .returning(Signal.signal_id)
    )
    result = await session.execute(stmt)
    return result.first() is not None


async def _already_checked_sources(session: AsyncSession, prefix: str) -> set[str]:
    """original_source values ('news:{id}' / 'scoop:{id}') already run through
    extraction at least once - see SignalExtractionCheck's docstring for why
    this can't just be "does a Signal row exist": a row correctly classified
    as carrying no real signal never gets one, so without this table it (and,
    if it landed on the LLM fallback, a fresh Gemini call for it) was redone
    on every single upload, forever. No org scoping needed - original_source
    is already globally unique (see Signal's own unique constraint)."""
    rows = await _rows(
        session,
        "SELECT original_source FROM signal_extraction_check WHERE original_source LIKE :prefix",
        prefix=f"{prefix}%",
    )
    return {r[0] for r in rows}


async def _mark_checked(session: AsyncSession, original_sources: list[str]) -> None:
    """Records that every one of these rows was run through extraction this
    pass, regardless of outcome - called once per extraction with every row
    actually considered (i.e. not already skipped), so next time none of
    them get re-classified or re-sent to the LLM."""
    if not original_sources:
        return
    stmt = (
        pg_insert(SignalExtractionCheck)
        .values([{"original_source": s} for s in original_sources])
        .on_conflict_do_nothing(index_elements=["original_source"])
    )
    await session.execute(stmt)


async def _rows(session: AsyncSession, sql: str, **params):
    result = await session.execute(text(sql), params)
    return result.all()


def _news_text(news) -> str:
    return f"{news.title or ''}. {news.description or ''}".strip()[:600]


async def _extract_news_signals(session: AsyncSession, organisation_id) -> tuple[int, int]:
    inserted = skipped = 0
    stmt = (
        select(CompanyNews, Company.company_name, Company.industries)
        .join(Company, Company.company_id == CompanyNews.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    all_rows = (await session.execute(stmt)).all()

    # Skip news already checked in a previous run (see _already_checked_sources)
    # - re-processing the org's entire signal history on every upload meant
    # re-classifying (and re-calling the LLM for) rows that were already
    # done, every single time - including rows correctly found to carry no
    # real signal, which never get a Signal row to check against.
    already = await _already_checked_sources(session, "news:")
    rows = [r for r in all_rows if f"news:{r[0].news_id}" not in already]
    skipped += len(all_rows) - len(rows)

    # Phase 1 - classify. A confident keyword hit is trusted as-is (fast,
    # deterministic, high-precision). Anything that only landed on the generic
    # NEWS_FALLBACK_TYPE is the vague text keywords can't read, so it goes to
    # the LLM (signal_llm), which either finds a real signal type or says
    # "none" (dropped as noise).
    resolved: dict[str, _Resolved] = {}
    llm_items: list[signal_llm.LlmItem] = []
    llm_map: dict[int, CompanyNews] = {}

    for news, company_name, industries in rows:
        signal_type, extraction_confidence = classify_news(news.title, news.description)
        if signal_type != NEWS_FALLBACK_TYPE:
            resolved[news.news_id] = _Resolved(
                signal_type=signal_type,
                extraction_confidence=extraction_confidence,
                is_action=classify_is_action_news(news.title),
                core_fact=extract_core_fact(news.title),
                dollar_value_usd=(
                    extract_dollar_value(f"{news.title or ''} {news.description or ''}")
                    if signal_type in DOLLAR_VALUE_SIGNAL_TYPES
                    else None
                ),
                method="rule_based",
            )
        else:
            idx = len(llm_items)
            llm_map[idx] = news
            llm_items.append(
                signal_llm.LlmItem(
                    index=idx,
                    company=company_name,
                    industry=(industries or [None])[0],
                    text=_news_text(news),
                )
            )

    if llm_items:
        try:
            classes = await signal_llm.classify_batch(llm_items)
            for idx, news in llm_map.items():
                cls = classes.get(idx)
                if cls and cls.signal_type is not None:
                    resolved[news.news_id] = _Resolved(
                        signal_type=cls.signal_type,
                        extraction_confidence=cls.confidence,
                        is_action=cls.is_action,
                        core_fact=cls.core_fact or extract_core_fact(news.title),
                        dollar_value_usd=(
                            cls.dollar_value_usd if cls.signal_type in DOLLAR_VALUE_SIGNAL_TYPES else None
                        ),
                        method="llm",
                    )
                # else: LLM found no real signal - leave unresolved (dropped).
        except llm_client.LLMNotConfiguredError:
            # No key configured: preserve the previous behaviour (store the
            # generic technology_assessment signal) so extraction still runs.
            for news in llm_map.values():
                signal_type, extraction_confidence = classify_news(news.title, news.description)
                resolved[news.news_id] = _Resolved(
                    signal_type=signal_type,
                    extraction_confidence=extraction_confidence,
                    is_action=classify_is_action_news(news.title),
                    core_fact=extract_core_fact(news.title),
                    dollar_value_usd=None,
                    method="rule_based",
                )

    # Phase 2 - score + insert. Scoring math (m2/m3/m4, signal_confidence) is
    # unchanged and stays deterministic regardless of how the row was classed.
    for news, _company_name, _industries in rows:
        r = resolved.get(news.news_id)
        if r is None:
            skipped += 1
            continue

        m2 = await _compute_m2(session, news.company_id, r.signal_type)
        m3 = compute_m3(news.page_date)
        m4 = compute_m4(r.is_action)

        values = dict(
            company_id=news.company_id,
            original_source=f"news:{news.news_id}",
            signal_type=r.signal_type,
            signal_category=SIGNAL_CATEGORY_MAP[r.signal_type],
            core_fact=r.core_fact,
            raw_payload={
                "news_id": news.news_id,
                "title": news.title,
                "description": news.description,
                "domain": news.domain,
                "category": news.category,
                "page_date": news.page_date.isoformat() if news.page_date else None,
            },
            dollar_value_usd=r.dollar_value_usd,
            extraction_method=r.method,
            extraction_confidence=r.extraction_confidence,
            is_action=r.is_action,
            m2_corroboration=m2,
            m3_recency=m3,
            m4_resourcing=m4,
            signal_confidence=compute_signal_confidence(m2, m3, m4),
        )
        if await _insert_signal(session, values):
            inserted += 1
        else:
            skipped += 1

    # Mark every row actually considered this pass as checked - including
    # ones that resolved to "no real signal" and so never got a Signal row -
    # so none of them get reclassified (or re-sent to the LLM) next time.
    await _mark_checked(session, [f"news:{news.news_id}" for news, _cn, _ind in rows])

    return inserted, skipped


def _scoop_text(scoop) -> str:
    topic = (scoop.topics[0].get("topic") if scoop.topics else "") or ""
    return f"{topic}. {scoop.description or ''}".strip()[:600]


async def _extract_scoop_signals(session: AsyncSession, organisation_id) -> tuple[int, int]:
    inserted = skipped = 0
    stmt = (
        select(CompanyScoop, Company.company_name, Company.industries)
        .join(Company, Company.company_id == CompanyScoop.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    all_rows = (await session.execute(stmt)).all()

    # Skip scoops already checked in a previous run - see the matching
    # comment in _extract_news_signals above.
    already = await _already_checked_sources(session, "scoop:")
    rows = [r for r in all_rows if f"scoop:{r[0].scoop_id}" not in already]
    skipped += len(all_rows) - len(rows)

    # Phase 1 - keyword topic-mapping first; scoops whose topic doesn't map to
    # a rule (previously silently dropped - lost recall) now go to the LLM.
    resolved: dict[str, _Resolved] = {}
    llm_items: list[signal_llm.LlmItem] = []
    llm_map: dict[int, CompanyScoop] = {}

    for scoop, company_name, industries in rows:
        classification = classify_scoop(scoop.topics, scoop.description)
        if classification is not None:
            signal_type, is_action = classification
            resolved[scoop.scoop_id] = _Resolved(
                signal_type=signal_type,
                extraction_confidence=0.90,
                is_action=is_action,
                core_fact=extract_core_fact(scoop.description),
                dollar_value_usd=None,
                method="rule_based",
            )
        else:
            idx = len(llm_items)
            llm_map[idx] = scoop
            llm_items.append(
                signal_llm.LlmItem(
                    index=idx,
                    company=company_name,
                    industry=(industries or [None])[0],
                    text=_scoop_text(scoop),
                )
            )

    if llm_items:
        try:
            classes = await signal_llm.classify_batch(llm_items)
            for idx, scoop in llm_map.items():
                cls = classes.get(idx)
                if cls and cls.signal_type is not None:
                    resolved[scoop.scoop_id] = _Resolved(
                        signal_type=cls.signal_type,
                        extraction_confidence=cls.confidence,
                        is_action=cls.is_action,
                        core_fact=cls.core_fact or extract_core_fact(scoop.description),
                        dollar_value_usd=(
                            cls.dollar_value_usd if cls.signal_type in DOLLAR_VALUE_SIGNAL_TYPES else None
                        ),
                        method="llm",
                    )
                # else: no real signal - dropped (same as the old None path).
        except llm_client.LLMNotConfiguredError:
            # No key: unmapped scoops stay dropped, exactly as before.
            pass

    # Phase 2 - score + insert (unchanged deterministic scoring math).
    for scoop, _company_name, _industries in rows:
        r = resolved.get(scoop.scoop_id)
        if r is None:
            skipped += 1
            continue

        m2 = await _compute_m2(session, scoop.company_id, r.signal_type)
        m3 = compute_m3(scoop.published_date)
        m4 = compute_m4(r.is_action)

        values = dict(
            company_id=scoop.company_id,
            original_source=f"scoop:{scoop.scoop_id}",
            signal_type=r.signal_type,
            signal_category=SIGNAL_CATEGORY_MAP[r.signal_type],
            core_fact=r.core_fact,
            raw_payload={
                "scoop_id": scoop.scoop_id,
                "description": scoop.description,
                "topics": scoop.topics,
                "types": scoop.types,
                "published_date": scoop.published_date.isoformat() if scoop.published_date else None,
            },
            dollar_value_usd=r.dollar_value_usd,
            extraction_method=r.method,
            extraction_confidence=r.extraction_confidence,
            is_action=r.is_action,
            m2_corroboration=m2,
            m3_recency=m3,
            m4_resourcing=m4,
            signal_confidence=compute_signal_confidence(m2, m3, m4),
        )
        if await _insert_signal(session, values):
            inserted += 1
        else:
            skipped += 1

    # Mark every row actually considered this pass as checked - see the
    # matching comment in _extract_news_signals above.
    await _mark_checked(session, [f"scoop:{scoop.scoop_id}" for scoop, _cn, _ind in rows])

    return inserted, skipped


async def extract_signals(session: AsyncSession, organisation_id) -> dict:
    news_inserted, news_skipped = await _extract_news_signals(session, organisation_id)
    scoop_inserted, scoop_skipped = await _extract_scoop_signals(session, organisation_id)
    await session.commit()
    return {
        "inserted": news_inserted + scoop_inserted,
        "skipped": news_skipped + scoop_skipped,
    }
