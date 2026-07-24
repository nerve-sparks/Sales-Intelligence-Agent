import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import bindparam, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_maker
from app.models import Company, IcpProfile, LeadScore
from app.services import scoring_llm
from app.services.scoring_llm import JudgeInput, ScoringJudgement

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


async def _rows(session: AsyncSession, sql: str, **params):
    result = await session.execute(text(sql), params)
    return result.all()


# ── BULK PREFETCH ──────────────────────────────────────────────────────────────
#
# Everything below fetches one gate/dimension's raw ingredient for EVERY
# in-scope company in a single query (GROUP BY / bulk SELECT), instead of the
# original one-query-per-company-per-check design. For a few hundred
# companies that was ~12-15 sequential queries each (~6,000+ round-trips for
# 500 companies) - now it's a fixed ~11 queries total, regardless of how many
# companies are being scored. Each function preserves the exact original
# SQL/thresholds of the check it replaces; only the batching changed.


async def _bulk_company_fields(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, dict]:
    rows = await _rows(
        session,
        """
        SELECT company_id, revenue_usd, recent_funding_amount, country,
               primary_industry, industries, employee_count, technologies
        FROM company WHERE company_id = ANY(:company_ids)
        """,
        company_ids=company_ids,
    )
    return {
        r[0]: {
            "revenue_usd": r[1],
            "recent_funding_amount": r[2],
            "country": r[3],
            "primary_industry": r[4],
            "industries": r[5],
            "employee_count": r[6],
            "technologies": r[7],
        }
        for r in rows
    }


async def _bulk_intent_over_70_counts(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int]:
    """Backs Gate 1 (any) AND D2's non-judgement fallback bucket (count) -
    both were the exact same per-company query in the original code."""
    rows = await _rows(
        session,
        """
        SELECT company_id, COUNT(*) FROM company_intent
        WHERE company_id = ANY(:company_ids) AND signal_score > 70
        GROUP BY company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


async def _bulk_gate2_reachable_counts(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int]:
    stmt = text(
        """
        SELECT company_id, COUNT(*) FROM decision_maker
        WHERE company_id = ANY(:company_ids)
        AND persona IN :personas
        AND email IS NOT NULL
        GROUP BY company_id
        """
    ).bindparams(bindparam("personas", expanding=True))
    result = await session.execute(stmt, {"company_ids": company_ids, "personas": list(REACHABLE_PERSONAS)})
    return {r[0]: r[1] for r in result.all()}


async def _bulk_gate4_scoop_counts(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int]:
    rows = await _rows(
        session,
        """
        SELECT company_id, COUNT(*) FROM company_scoop
        WHERE company_id = ANY(:company_ids)
        AND topics::text ILIKE ANY(ARRAY['%RFP%','%Vendor Evaluation%','%Leadership Change%','%Partnership%','%Contract%'])
        GROUP BY company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


async def _bulk_gate4_news_counts(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int]:
    rows = await _rows(
        session,
        """
        SELECT company_id, COUNT(*) FROM company_news
        WHERE company_id = ANY(:company_ids) AND category IN ('FUNDING', 'PRODUCT')
        GROUP BY company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


async def _bulk_recency_dates(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, datetime | None]:
    """Most recent of each company's intent/scoop/news dates - backs Gate 5
    AND D5's recency_factor (identical underlying computation in the
    original code, just used two different ways downstream)."""
    rows = await _rows(
        session,
        """
        SELECT c.company_id,
               GREATEST(
                   MAX(ci.signal_date),
                   MAX(cs.published_date),
                   MAX(cn.page_date)
               ) AS most_recent
        FROM company c
        LEFT JOIN company_intent ci ON ci.company_id = c.company_id
        LEFT JOIN company_scoop  cs ON cs.company_id = c.company_id
        LEFT JOIN company_news   cn ON cn.company_id = c.company_id
        WHERE c.company_id = ANY(:company_ids)
        GROUP BY c.company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


async def _bulk_d1_fallback_counts(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int]:
    rows = await _rows(
        session,
        """
        SELECT company_id, COUNT(*) FROM signal
        WHERE company_id = ANY(:company_ids)
        AND signal_category IN ('ai_seriousness', 'ai_pain_points')
        AND signal_confidence > 0.60
        GROUP BY company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


async def _bulk_intent_max_scores(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int | None]:
    rows = await _rows(
        session,
        """
        SELECT company_id, MAX(signal_score) FROM company_intent
        WHERE company_id = ANY(:company_ids)
        GROUP BY company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


async def _bulk_decision_makers(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, list[tuple]]:
    """Raw (persona, department) rows per company - backs D4 (authority) AND
    D6 (ICP persona/department match), both of which only used non-empty
    values from the same underlying rows in the original code."""
    rows = await _rows(
        session,
        "SELECT company_id, persona, department FROM decision_maker WHERE company_id = ANY(:company_ids)",
        company_ids=company_ids,
    )
    out: dict[UUID, list[tuple]] = {}
    for company_id, persona, department in rows:
        out.setdefault(company_id, []).append((persona, department))
    return out


async def _bulk_scoop_topics(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, list]:
    rows = await _rows(
        session,
        "SELECT company_id, topics FROM company_scoop WHERE company_id = ANY(:company_ids)",
        company_ids=company_ids,
    )
    out: dict[UUID, list] = {}
    for company_id, topics in rows:
        out.setdefault(company_id, []).append(topics)
    return out


async def _bulk_news_categories(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, list]:
    rows = await _rows(
        session,
        "SELECT company_id, category FROM company_news WHERE company_id = ANY(:company_ids)",
        company_ids=company_ids,
    )
    out: dict[UUID, list] = {}
    for company_id, category in rows:
        out.setdefault(company_id, []).append(category)
    return out


async def _bulk_d7_counts(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, int]:
    rows = await _rows(
        session,
        """
        SELECT company_id, COUNT(*) FROM signal
        WHERE company_id = ANY(:company_ids) AND signal_type = 'existing_vendor_mentioned'
        GROUP BY company_id
        """,
        company_ids=company_ids,
    )
    return {r[0]: r[1] for r in rows}


def _first_scoop_topic(topics) -> str | None:
    """company_scoop.topics is JSONB [{id, topic}] - pull the first topic
    label for the LLM judge's input, or None if the shape isn't what we expect."""
    if isinstance(topics, list) and topics and isinstance(topics[0], dict):
        return topics[0].get("topic")
    return None


async def _gather_judge_inputs(session: AsyncSession, company_ids) -> list[JudgeInput]:
    """One query pulling each company's single intent topic + latest scoop +
    latest news (the text the LLM judge reads for D1/D2). LATERAL LIMIT 1 per
    child table keeps it to one row per company even if a company happens to
    have more than one."""
    if not company_ids:
        return []
    rows = await _rows(
        session,
        """
        SELECT c.company_id,
               ci.topic          AS intent_topic,
               cs.topics         AS scoop_topics,
               cs.description    AS scoop_description,
               cn.title          AS news_title,
               cn.description    AS news_description
        FROM company c
        LEFT JOIN LATERAL (
            SELECT topic FROM company_intent
            WHERE company_id = c.company_id
            ORDER BY signal_score DESC NULLS LAST LIMIT 1
        ) ci ON true
        LEFT JOIN LATERAL (
            SELECT topics, description FROM company_scoop
            WHERE company_id = c.company_id
            ORDER BY published_date DESC NULLS LAST LIMIT 1
        ) cs ON true
        LEFT JOIN LATERAL (
            SELECT title, description FROM company_news
            WHERE company_id = c.company_id
            ORDER BY page_date DESC NULLS LAST LIMIT 1
        ) cn ON true
        WHERE c.company_id = ANY(:company_ids)
        """,
        company_ids=list(company_ids),
    )
    return [
        JudgeInput(
            company_id=r[0],
            intent_topic=r[1],
            scoop_topic=_first_scoop_topic(r[2]),
            scoop_description=r[3],
            news_title=r[4],
            news_description=r[5],
        )
        for r in rows
    ]


# ── PURE COMPUTATION (no I/O - everything below reads only prefetched data) ────

def _gate_3_economic_capacity(revenue_usd, recent_funding_amount) -> bool:
    return (revenue_usd is not None and revenue_usd > 15_000_000) or (
        recent_funding_amount is not None and recent_funding_amount > 0
    )


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
        base = 20  # was 0 - a small company still has some economic capacity
    bonus = 15 if (recent_funding_amount or 0) > 0 else 0  # was 20
    return min(base + bonus, 100)


# Authority tiers for persona "adjacency" in D6: personas one tier apart count
# as a partial (0.5) match. Derived from PERSONA_AUTHORITY_SCORES' 5 bands.
_SCORE_TO_TIER = {100: 0, 80: 1, 60: 2, 40: 3, 20: 4}


def _persona_tier(persona: str | None) -> int:
    return _SCORE_TO_TIER.get(PERSONA_AUTHORITY_SCORES.get(persona, 0), 5)


def _band_score(value, lo, hi, flexible: bool) -> float:
    """Graded fit of a value against an [lo, hi] band. Criterion unset (both
    None) -> 1.0 (skip). strict mode: inside -> 1.0, any outside -> 0.0.
    flexible: inside -> 1.0, within 20% outside -> 0.7, within 50% -> 0.3,
    beyond -> 0.0."""
    if lo is None and hi is None:
        return 1.0
    if value is None:
        return 0.0
    inside = (lo is None or value >= lo) and (hi is None or value <= hi)
    if inside:
        return 1.0
    if not flexible:
        return 0.0
    if lo is not None and value < lo:
        if value >= lo * 0.8:
            return 0.7
        if value >= lo * 0.5:
            return 0.3
        return 0.0
    if hi is not None and value > hi:
        if value <= hi * 1.2:
            return 0.7
        if value <= hi * 1.5:
            return 0.3
        return 0.0
    return 0.0


def _d6_icp_fit(company: dict, dm_personas: list[str], dm_departments: list[str], icp: IcpProfile | None) -> float:
    """Graded ICP fit, 0-100. No ICP in scope (e.g. the standalone
    POST /scores/run), or an ICP with no criteria at all -> neutral 50.
    HARD GATES (country, industry) only apply when that criterion is set;
    failing one -> 0 (company still scored/stored, just ranks at the bottom -
    product decision, keeps the org-wide Enterprise List from emptying out)."""
    if icp is None:
        return 50.0

    countries = icp.countries or []
    industries = icp.industries or []
    has_criteria = any(
        [
            countries,
            industries,
            icp.revenue_min_usd,
            icp.revenue_max_usd,
            icp.employee_min,
            icp.employee_max,
            icp.technologies,
            icp.buying_committee_personas,
            icp.departments,
        ]
    )
    if not has_criteria:
        return 50.0

    flexible = (icp.fit_mode or "flexible") == "flexible"

    # Hard gates
    if countries and company.get("country") not in countries:
        return 0.0
    company_inds = set((company.get("primary_industry") or []) + (company.get("industries") or []))
    if industries and not (company_inds & set(industries)):
        return 0.0

    # Soft bands
    revenue_band = _band_score(company.get("revenue_usd"), icp.revenue_min_usd, icp.revenue_max_usd, flexible)
    employee_band = _band_score(company.get("employee_count"), icp.employee_min, icp.employee_max, flexible)

    if icp.technologies:
        company_techs = {t.lower() for t in (company.get("technologies") or [])}
        icp_techs = {t.lower() for t in icp.technologies}
        technology_overlap = (len(company_techs & icp_techs) / len(icp_techs)) if icp_techs else 1.0
    else:
        technology_overlap = 1.0

    if icp.buying_committee_personas:
        icp_personas = set(icp.buying_committee_personas)
        if set(dm_personas) & icp_personas:
            persona_match = 1.0
        else:
            icp_tiers = {_persona_tier(p) for p in icp_personas}
            company_tiers = {_persona_tier(p) for p in dm_personas}
            adjacent = any(abs(a - b) == 1 for a in company_tiers for b in icp_tiers)
            persona_match = 0.5 if adjacent else 0.0
    else:
        persona_match = 1.0

    if icp.departments:
        department_match = 1.0 if (set(dm_departments) & set(icp.departments)) else 0.0
    else:
        department_match = 1.0

    icp_fit = (
        revenue_band * 0.30
        + employee_band * 0.20
        + technology_overlap * 0.20
        + persona_match * 0.20
        + department_match * 0.10
    )
    return icp_fit * 100


# ── ORCHESTRATION ──────────────────────────────────────────────────────────────

# Companies are scored in chunks of this size, with multiple chunks running
# concurrently (see run_scoring) instead of one giant all-or-nothing pass -
# each chunk commits its own LeadScore rows as soon as it finishes, so
# GET /scores/ranked shows a growing set of results while a large run is
# still in progress, rather than nothing until the entire org is done.
CHUNK_SIZE = 50
# Concurrent chunks in flight. Kept low (not scoring_llm's MAX_CONCURRENCY=8)
# because each chunk already runs its own internal LLM judge pass with up to
# 8 concurrent Gemini/Ollama calls - stacking multiple chunks' worth of that
# on top of each other would oversubscribe the LLM provider and the DB pool
# at the same time, undoing the benefit rather than adding it.
MAX_CHUNK_CONCURRENCY = 3


async def _score_batch(session: AsyncSession, company_ids: list[UUID], icp: IcpProfile | None) -> dict:
    """Scores exactly the given companies and stages their LeadScore upserts
    on `session` (caller commits - see run_scoring/_run_chunk). This is the
    same logic that used to be inline in run_scoring, just scoped to a
    caller-supplied list instead of always being the whole org, so it can be
    called once per chunk. All gate/dimension raw ingredients are still
    fetched in ~11 bulk queries per call (see the _bulk_* functions above),
    not one query per company."""
    if not company_ids:
        return {"active": 0, "nurture": 0}

    judge_inputs = await _gather_judge_inputs(session, company_ids)
    judgements = await scoring_llm.judge_companies(judge_inputs)

    ids_list = company_ids
    company_fields = await _bulk_company_fields(session, ids_list)
    intent_over_70_counts = await _bulk_intent_over_70_counts(session, ids_list)
    gate2_counts = await _bulk_gate2_reachable_counts(session, ids_list)
    gate4_scoop_counts = await _bulk_gate4_scoop_counts(session, ids_list)
    gate4_news_counts = await _bulk_gate4_news_counts(session, ids_list)
    recency_dates = await _bulk_recency_dates(session, ids_list)
    d1_fallback_counts = await _bulk_d1_fallback_counts(session, ids_list)
    intent_max_scores = await _bulk_intent_max_scores(session, ids_list)
    dm_by_company = await _bulk_decision_makers(session, ids_list)
    scoop_topics_by_company = await _bulk_scoop_topics(session, ids_list)
    news_categories_by_company = await _bulk_news_categories(session, ids_list)
    d7_counts = await _bulk_d7_counts(session, ids_list)

    cutoff = datetime.now(timezone.utc) - timedelta(days=GATE_5_RECENCY_DAYS)
    now = datetime.now(timezone.utc)

    values_list: list[dict] = []
    active = nurture = 0

    for company_id in ids_list:
        company = company_fields.get(company_id, {})
        revenue_usd = company.get("revenue_usd")
        recent_funding_amount = company.get("recent_funding_amount")

        gate_1 = intent_over_70_counts.get(company_id, 0) > 0
        gate_2 = gate2_counts.get(company_id, 0) > 0
        gate_3 = _gate_3_economic_capacity(revenue_usd, recent_funding_amount)
        gate_4 = (gate4_scoop_counts.get(company_id, 0) + gate4_news_counts.get(company_id, 0)) > 0

        most_recent = recency_dates.get(company_id)
        if most_recent is not None and most_recent.tzinfo is None:
            most_recent = most_recent.replace(tzinfo=timezone.utc)
        gate_5 = most_recent is not None and most_recent > cutoff

        # DEMO-ONLY: gate_check_1/4/5 are still computed and stored for
        # visibility, but excluded from gate_passed. Data sources without
        # company_intent/company_scoop/company_news populated yet (e.g. the
        # ZoomInfo CSV import) would otherwise fail all three for every
        # company (gate 5 has no dates to check recency against). Fold them
        # back into gate_passed once that data is populated.
        gate_passed = gate_2 and gate_3
        gate_status = "active" if gate_passed else "nurture"
        if gate_status == "active":
            active += 1
        else:
            nurture += 1

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
            "d1_reasoning": None,
            "d2_reasoning": None,
            "d5_reasoning": None,
            "recency_factor": None,
            "p_score": None,
            "deal_tier": None,
        }

        if gate_passed:
            judgement: ScoringJudgement | None = judgements.get(company_id)

            # D1 (buying signal): Gemini's read when judged, else the old
            # count-based fallback.
            if judgement is not None:
                d1 = judgement.d1_buying_signal
            else:
                d1 = min(d1_fallback_counts.get(company_id, 0) * 20, 100)

            # D2 (intent relevance): Gemini's relevance weight x real intent
            # score when judged, else the old count-bucket fallback (same
            # count as gate_1 - identical query in the original code).
            if judgement is not None:
                intent_score = intent_max_scores.get(company_id)
                multiplier = (intent_score / 100) if intent_score is not None else 0.5
                d2 = min(judgement.d2_intent_relevance * multiplier * 100, 100)
            else:
                count = intent_over_70_counts.get(company_id, 0)
                d2 = 0 if count == 0 else 33 if count <= 2 else 66 if count <= 5 else 100

            d3 = _d3_economic_capacity(revenue_usd, recent_funding_amount)

            dm_rows = dm_by_company.get(company_id, [])
            dm_personas = [p for p, _d in dm_rows if p]
            dm_departments = [d for _p, d in dm_rows if d]
            d4 = max((PERSONA_AUTHORITY_SCORES.get(p, 0) for p in dm_personas), default=0)

            # D5 = urgency x recency x 100. Urgency is the LLM's
            # d5_urgency_weight when judged, else the rule-based timing
            # proxy; recency is pure math from the most recent signal date.
            if most_recent is None:
                recency = 0.15
            else:
                years = (now - most_recent).days / 365.0
                recency = 1.00 if years < 2 else 0.70 if years < 4 else 0.40 if years < 6 else 0.15

            if judgement is not None:
                urgency = judgement.d5_urgency_weight
            else:
                scores = [0]
                for topics in scoop_topics_by_company.get(company_id, []):
                    if topics:
                        topic = (topics[0].get("topic") or "").strip().lower()
                        if topic in SCOOP_TIMING_SCORES:
                            scores.append(SCOOP_TIMING_SCORES[topic])
                for category in news_categories_by_company.get(company_id, []):
                    if category in NEWS_TIMING_SCORES:
                        scores.append(NEWS_TIMING_SCORES[category])
                urgency = max(scores) / 100.0
            d5 = min(urgency * recency * 100, 100.0)

            d6 = _d6_icp_fit(company, dm_personas, dm_departments, icp)
            d7 = 100 if d7_counts.get(company_id, 0) == 0 else 40

            # FIX 4 weights (sum to 1.0, D7 no longer in the blend):
            p_score = d1 * 0.25 + d2 * 0.25 + d3 * 0.15 + d4 * 0.15 + d5 * 0.15 + d6 * 0.05

            # FIX 5: E[$deal] -> fixed deal_tier -> lead_score. E[$deal] is a
            # raw dollar figure (10% of recent funding, else 10% of revenue,
            # floor 50k); deal_tier maps it to a stable 20/40/60/80/100 so
            # the final blend can't be dominated by one huge revenue number.
            if recent_funding_amount and recent_funding_amount > 0:
                expected_deal_value = float(recent_funding_amount) * 0.10
            else:
                expected_deal_value = float(revenue_usd or 0) * 0.10
            expected_deal_value = max(expected_deal_value, 50_000.0)

            if expected_deal_value >= 10_000_000:
                deal_tier = 100
            elif expected_deal_value >= 5_000_000:
                deal_tier = 80
            elif expected_deal_value >= 2_000_000:
                deal_tier = 60
            elif expected_deal_value >= 500_000:
                deal_tier = 40
            else:
                deal_tier = 20

            lead_score_value = min(p_score * 0.70 + deal_tier * 0.30, 100.0)

            values.update(
                d1_pain_acuity=round(d1, 2),
                d2_ai_intent=round(d2, 2),
                d3_economic_capacity=round(d3, 2),
                d4_authority=round(d4, 2),
                d5_timing_catalyst=round(d5, 2),
                d6_solution_fit=round(d6, 2),
                d7_competitive=d7,
                # component_score/p_convert kept populated for the current
                # frontend (Score Breakdown), now mirroring the new
                # readiness sub-score.
                component_score=round(p_score, 2),
                p_convert=round(p_score / 100, 3),
                expected_deal_value_usd=round(expected_deal_value, 2),
                lead_score=round(lead_score_value, 2),
                d1_reasoning=judgement.d1_reasoning if judgement else None,
                d2_reasoning=judgement.d2_reasoning if judgement else None,
                d5_reasoning=judgement.d5_reasoning if judgement else None,
                recency_factor=round(recency, 3),
                p_score=round(p_score, 2),
                deal_tier=deal_tier,
            )

        values_list.append(values)

    # One bulk upsert for every company, instead of one upsert per company.
    insert_stmt = pg_insert(LeadScore).values(values_list)
    excluded = insert_stmt.excluded
    update_cols = {col: getattr(excluded, col) for col in values_list[0] if col != "company_id"}
    update_cols["scored_at"] = text("now()")
    stmt = insert_stmt.on_conflict_do_update(index_elements=["company_id"], set_=update_cols)
    await session.execute(stmt)
    # No commit here - the caller (run_scoring's _run_chunk) owns the
    # transaction, since a chunk-scoped session commits its own chunk
    # independently of every other chunk in the run.

    return {"active": active, "nurture": nurture}


async def _run_chunk(company_ids: list[UUID], icp: IcpProfile | None) -> dict:
    """One chunk's entire lifecycle: its own session (never shared across
    concurrent chunks - AsyncSession isn't safe for that), its own LLM judge
    pass, its own bulk-fetch, its own upsert, its own commit. Committing here
    (not at the end of the whole run) is what makes results show up
    progressively in GET /scores/ranked while a large run is still going."""
    async with async_session_maker() as session:
        result = await _score_batch(session, company_ids, icp)
        await session.commit()
        return result


async def run_scoring(
    session: AsyncSession,
    organisation_id,
    company_ids: set[UUID] | None = None,
    icp: IcpProfile | None = None,
) -> dict:
    """Scores every company in the org, unless company_ids is given - then
    only those companies are scored. icp, when given, drives the graded D6
    ICP-fit dimension for every company being scored - not just the ones
    from that ICP's own upload batch, so ranking a chosen ICP against the
    whole org reflects fit-to-THAT-ICP consistently, not whatever ICP was
    active when each company happened to last be scored. Without an icp
    (standalone POST /scores/run with no ICP in scope) D6 falls back to a
    neutral 50.

    Companies are split into CHUNK_SIZE-sized batches, and up to
    MAX_CHUNK_CONCURRENCY chunks run concurrently, each with its own session
    that commits independently as soon as that chunk finishes (see
    _run_chunk) - so GET /scores/ranked shows a growing set of results while
    a large run is still in progress, instead of an all-or-nothing wait for
    every company in the org."""
    stmt = select(Company.company_id).where(Company.organisation_id == organisation_id)
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    ids = (await session.execute(stmt)).scalars().all()

    if not ids:
        return {"active": 0, "nurture": 0}

    ids_list = list(ids)
    chunks = [ids_list[i : i + CHUNK_SIZE] for i in range(0, len(ids_list), CHUNK_SIZE)]
    semaphore = asyncio.Semaphore(MAX_CHUNK_CONCURRENCY)

    async def _bounded(chunk: list[UUID]) -> dict:
        async with semaphore:
            return await _run_chunk(chunk, icp)

    results = await asyncio.gather(*[_bounded(chunk) for chunk in chunks])

    active = sum(r["active"] for r in results)
    nurture = sum(r["nurture"] for r in results)
    return {"active": active, "nurture": nurture}
