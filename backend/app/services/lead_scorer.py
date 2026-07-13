from datetime import datetime, timedelta, timezone

from sqlalchemy import bindparam, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, LeadScore

REACHABLE_PERSONAS = (
    "ceo", "cto", "cfo", "coo", "founder", "co_founder",
    "president", "chief_ai_officer",
)

PERSONA_AUTHORITY_SCORES = {
    "ceo": 100, "cto": 100, "cfo": 100, "founder": 100, "co_founder": 100,
    "president": 100, "chairman": 100,
    "coo": 80, "cio": 80, "ciso": 80, "chief_ai_officer": 80, "chief_data_officer": 80,
    "evp": 60, "svp": 60,
    "vp_operations": 40, "vp_sales": 40, "managing_director": 40,
    "director": 20, "general_manager": 20,
}

# DEMO-ONLY: spec says 1 year. Seed data tops out at 2024-06, system clock is
# well past that, so 1 year fails Gate 5 for every company. Revert to 365 when
# real/current ZoomInfo data is flowing.
GATE_5_RECENCY_DAYS = 365 * 3

SCOOP_TIMING_SCORES = {
    "rfp published": 100,
    "vendor evaluation": 80,
    "leadership change": 70,
    "facilities relocation/expansion": 60,
}
NEWS_TIMING_SCORES = {"FUNDING": 70, "PRODUCT": 50}


async def _scalar(session: AsyncSession, sql: str, **params):
    result = await session.execute(text(sql), params)
    return result.scalar()


async def _rows(session: AsyncSession, sql: str, **params):
    result = await session.execute(text(sql), params)
    return result.all()


# ── GATE CHECKS ────────────────────────────────────────────────────────────────

async def _gate_1_ai_intent(session, company_id) -> bool:
    count = await _scalar(
        session,
        "SELECT COUNT(*) FROM company_intent WHERE company_id = :company_id AND signal_score > 70",
        company_id=company_id,
    )
    return (count or 0) > 0


async def _gate_2_reachable(session, company_id) -> bool:
    stmt = text(
        """
        SELECT COUNT(*) FROM decision_maker
        WHERE company_id = :company_id
        AND persona IN :personas
        AND email IS NOT NULL
        """
    ).bindparams(bindparam("personas", expanding=True))
    result = await session.execute(stmt, {"company_id": company_id, "personas": list(REACHABLE_PERSONAS)})
    count = result.scalar()
    return (count or 0) > 0


async def _gate_3_economic_capacity(revenue_usd, recent_funding_amount) -> bool:
    return (revenue_usd is not None and revenue_usd > 15_000_000) or (
        recent_funding_amount is not None and recent_funding_amount > 0
    )


async def _gate_4_active_signal(session, company_id) -> bool:
    scoop_count = await _scalar(
        session,
        """
        SELECT COUNT(*) FROM company_scoop
        WHERE company_id = :company_id
        AND topics::text ILIKE ANY(ARRAY['%RFP%','%Vendor Evaluation%','%Leadership Change%','%Partnership%','%Contract%'])
        """,
        company_id=company_id,
    )
    news_count = await _scalar(
        session,
        """
        SELECT COUNT(*) FROM company_news
        WHERE company_id = :company_id AND category IN ('FUNDING', 'PRODUCT')
        """,
        company_id=company_id,
    )
    return ((scoop_count or 0) + (news_count or 0)) > 0


async def _gate_5_recency(session, company_id) -> bool:
    row = await _rows(
        session,
        """
        SELECT
            MAX(ci.signal_date)    AS max_intent,
            MAX(cs.published_date) AS max_scoop,
            MAX(cn.page_date)      AS max_news
        FROM company c
        LEFT JOIN company_intent ci ON ci.company_id = c.company_id
        LEFT JOIN company_scoop  cs ON cs.company_id = c.company_id
        LEFT JOIN company_news   cn ON cn.company_id = c.company_id
        WHERE c.company_id = :company_id
        """,
        company_id=company_id,
    )
    if not row:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(days=GATE_5_RECENCY_DAYS)
    dates = [d for d in row[0] if d is not None]
    dates = [d if d.tzinfo else d.replace(tzinfo=timezone.utc) for d in dates]
    return any(d > cutoff for d in dates)


# ── COMPONENT SCORES ───────────────────────────────────────────────────────────

async def _d1_pain_acuity(session, company_id) -> float:
    count = await _scalar(
        session,
        """
        SELECT COUNT(*) FROM signal
        WHERE company_id = :company_id
        AND signal_category IN ('ai_seriousness', 'ai_pain_points')
        AND signal_confidence > 0.60
        """,
        company_id=company_id,
    )
    return min((count or 0) * 20, 100)


async def _d2_ai_intent(session, company_id) -> float:
    count = await _scalar(
        session,
        "SELECT COUNT(*) FROM company_intent WHERE company_id = :company_id AND signal_score > 70",
        company_id=company_id,
    )
    count = count or 0
    if count == 0:
        return 0
    if count <= 2:
        return 33
    if count <= 5:
        return 66
    return 100


def _d3_economic_capacity(revenue_usd, recent_funding_amount) -> float:
    revenue_usd = revenue_usd or 0
    if revenue_usd >= 200_000_000:
        base = 100
    elif revenue_usd >= 100_000_000:
        base = 80
    elif revenue_usd >= 50_000_000:
        base = 60
    elif revenue_usd >= 20_000_000:
        base = 40
    else:
        base = 0
    bonus = 20 if (recent_funding_amount or 0) > 0 else 0
    return min(base + bonus, 100)


async def _d4_authority(session, company_id) -> float:
    rows = await _rows(
        session,
        "SELECT persona FROM decision_maker WHERE company_id = :company_id",
        company_id=company_id,
    )
    scores = [PERSONA_AUTHORITY_SCORES.get(r[0], 0) for r in rows]
    return max(scores) if scores else 0


async def _d5_timing_catalyst(session, company_id) -> float:
    scoop_rows = await _rows(
        session,
        "SELECT topics FROM company_scoop WHERE company_id = :company_id",
        company_id=company_id,
    )
    news_rows = await _rows(
        session,
        "SELECT category FROM company_news WHERE company_id = :company_id",
        company_id=company_id,
    )
    scores = [0]
    for (topics,) in scoop_rows:
        if topics:
            topic = (topics[0].get("topic") or "").strip().lower()
            if topic in SCOOP_TIMING_SCORES:
                scores.append(SCOOP_TIMING_SCORES[topic])
    for (category,) in news_rows:
        if category in NEWS_TIMING_SCORES:
            scores.append(NEWS_TIMING_SCORES[category])
    return max(scores)


async def _d7_competitive(session, company_id) -> float:
    count = await _scalar(
        session,
        "SELECT COUNT(*) FROM signal WHERE company_id = :company_id AND signal_type = 'existing_vendor_mentioned'",
        company_id=company_id,
    )
    return 100 if (count or 0) == 0 else 40


async def _expected_deal_value(session, company_id, revenue_usd, recent_funding_amount) -> float:
    row = await _rows(
        session,
        """
        SELECT SUM(dollar_value_usd * signal_confidence) AS weighted_sum,
               SUM(signal_confidence) AS conf_sum
        FROM signal
        WHERE company_id = :company_id AND dollar_value_usd IS NOT NULL
        """,
        company_id=company_id,
    )
    weighted_sum, conf_sum = row[0] if row else (None, None)

    if weighted_sum is not None and conf_sum:
        e_deal = float(weighted_sum) / float(conf_sum)
    elif recent_funding_amount and recent_funding_amount > 0:
        e_deal = float(recent_funding_amount) * 0.10
    else:
        e_deal = float(revenue_usd or 0) * 0.001

    return max(e_deal, 50000.0)


# ── ORCHESTRATION ──────────────────────────────────────────────────────────────

async def score_company(session: AsyncSession, company_id) -> dict:
    company_row = await _rows(
        session,
        "SELECT revenue_usd, recent_funding_amount FROM company WHERE company_id = :company_id",
        company_id=company_id,
    )
    revenue_usd, recent_funding_amount = company_row[0] if company_row else (None, None)

    gate_1 = await _gate_1_ai_intent(session, company_id)
    gate_2 = await _gate_2_reachable(session, company_id)
    gate_3 = await _gate_3_economic_capacity(revenue_usd, recent_funding_amount)
    gate_4 = await _gate_4_active_signal(session, company_id)
    gate_5 = await _gate_5_recency(session, company_id)
    # DEMO-ONLY: gate_check_1/4/5 are still computed and stored for
    # visibility, but excluded from gate_passed. Data sources without
    # company_intent/company_scoop/company_news populated yet (e.g. the
    # ZoomInfo CSV import) would otherwise fail all three for every company
    # (gate 5 has no dates to check recency against). Fold them back into
    # gate_passed once that data is populated.
    gate_passed = gate_2 and gate_3
    gate_status = "active" if gate_passed else "nurture"

    values = {
        "company_id": company_id,
        "gate_check_1": gate_1,
        "gate_check_2": gate_2,
        "gate_check_3": gate_3,
        "gate_check_4": gate_4,
        "gate_check_5": gate_5,
        "gate_passed": gate_passed,
        "gate_status": gate_status,
        "d1_pain_acuity": None,
        "d2_ai_intent": None,
        "d3_economic_capacity": None,
        "d4_authority": None,
        "d5_timing_catalyst": None,
        "d6_solution_fit": None,
        "d7_competitive": None,
        "component_score": None,
        "p_convert": None,
        "expected_deal_value_usd": None,
        "lead_score": None,
    }

    if gate_passed:
        d1 = await _d1_pain_acuity(session, company_id)
        d2 = await _d2_ai_intent(session, company_id)
        d3 = _d3_economic_capacity(revenue_usd, recent_funding_amount)
        d4 = await _d4_authority(session, company_id)
        d5 = await _d5_timing_catalyst(session, company_id)
        d6 = 50
        d7 = await _d7_competitive(session, company_id)

        component_score = (
            d1 * 0.25 + d2 * 0.20 + d3 * 0.15 + d4 * 0.15
            + d5 * 0.15 + d6 * 0.05 + d7 * 0.05
        )
        p_convert = component_score / 100
        expected_deal_value = await _expected_deal_value(session, company_id, revenue_usd, recent_funding_amount)

        # lead_score is a 0-100 blend: 70% readiness (component_score) + 30% deal
        # size relative to the company's own revenue (capped at 100%). expected_deal_value_usd
        # itself stays a raw dollar figure.
        if revenue_usd and revenue_usd > 0:
            deal_value_pct = min((expected_deal_value / float(revenue_usd)) * 100, 100.0)
        else:
            deal_value_pct = 0.0
        lead_score_value = min(component_score * 0.7 + deal_value_pct * 0.3, 100.0)

        values.update(
            d1_pain_acuity=d1,
            d2_ai_intent=d2,
            d3_economic_capacity=d3,
            d4_authority=d4,
            d5_timing_catalyst=d5,
            d6_solution_fit=d6,
            d7_competitive=d7,
            component_score=round(component_score, 2),
            p_convert=round(p_convert, 3),
            expected_deal_value_usd=round(expected_deal_value, 2),
            lead_score=round(lead_score_value, 2),
        )

    insert_stmt = pg_insert(LeadScore).values(**values)
    excluded = insert_stmt.excluded
    update_cols = {
        col: getattr(excluded, col)
        for col in values
        if col != "company_id"
    }
    update_cols["scored_at"] = text("now()")

    stmt = insert_stmt.on_conflict_do_update(
        index_elements=["company_id"],
        set_=update_cols,
    )
    await session.execute(stmt)

    return {"company_id": company_id, "gate_status": gate_status}


async def run_scoring(session: AsyncSession) -> dict:
    company_ids = (await session.execute(select(Company.company_id))).scalars().all()

    active = nurture = 0
    for company_id in company_ids:
        result = await score_company(session, company_id)
        if result["gate_status"] == "active":
            active += 1
        else:
            nurture += 1

    await session.commit()
    return {"active": active, "nurture": nurture}
