import re
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CompanyNews, CompanyScoop, Signal

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


async def _extract_news_signals(session: AsyncSession) -> tuple[int, int]:
    inserted = skipped = 0
    rows = (await session.execute(select(CompanyNews))).scalars().all()

    for news in rows:
        signal_type, extraction_confidence = classify_news(news.title, news.description)
        is_action = classify_is_action_news(news.title)
        dollar_value = extract_dollar_value(f"{news.title or ''} {news.description or ''}")

        m2 = await _compute_m2(session, news.company_id, signal_type)
        m3 = compute_m3(news.page_date)
        m4 = compute_m4(is_action)

        values = dict(
            company_id=news.company_id,
            original_source=f"news:{news.news_id}",
            signal_type=signal_type,
            signal_category=SIGNAL_CATEGORY_MAP[signal_type],
            core_fact=extract_core_fact(news.title),
            raw_payload={
                "news_id": news.news_id,
                "title": news.title,
                "description": news.description,
                "domain": news.domain,
                "category": news.category,
                "page_date": news.page_date.isoformat() if news.page_date else None,
            },
            dollar_value_usd=dollar_value,
            extraction_confidence=extraction_confidence,
            is_action=is_action,
            m2_corroboration=m2,
            m3_recency=m3,
            m4_resourcing=m4,
            signal_confidence=compute_signal_confidence(m2, m3, m4),
        )
        if await _insert_signal(session, values):
            inserted += 1
        else:
            skipped += 1

    return inserted, skipped


async def _extract_scoop_signals(session: AsyncSession) -> tuple[int, int]:
    inserted = skipped = 0
    rows = (await session.execute(select(CompanyScoop))).scalars().all()

    for scoop in rows:
        classification = classify_scoop(scoop.topics, scoop.description)
        if classification is None:
            skipped += 1
            continue

        signal_type, is_action = classification
        m2 = await _compute_m2(session, scoop.company_id, signal_type)
        m3 = compute_m3(scoop.published_date)
        m4 = compute_m4(is_action)

        values = dict(
            company_id=scoop.company_id,
            original_source=f"scoop:{scoop.scoop_id}",
            signal_type=signal_type,
            signal_category=SIGNAL_CATEGORY_MAP[signal_type],
            core_fact=extract_core_fact(scoop.description),
            raw_payload={
                "scoop_id": scoop.scoop_id,
                "description": scoop.description,
                "topics": scoop.topics,
                "types": scoop.types,
                "published_date": scoop.published_date.isoformat() if scoop.published_date else None,
            },
            dollar_value_usd=None,
            extraction_confidence=0.90,
            is_action=is_action,
            m2_corroboration=m2,
            m3_recency=m3,
            m4_resourcing=m4,
            signal_confidence=compute_signal_confidence(m2, m3, m4),
        )
        if await _insert_signal(session, values):
            inserted += 1
        else:
            skipped += 1

    return inserted, skipped


async def extract_signals(session: AsyncSession) -> dict:
    news_inserted, news_skipped = await _extract_news_signals(session)
    scoop_inserted, scoop_skipped = await _extract_scoop_signals(session)
    await session.commit()
    return {
        "inserted": news_inserted + scoop_inserted,
        "skipped": news_skipped + scoop_skipped,
    }
