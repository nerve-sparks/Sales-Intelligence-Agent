"""The evidence-based scoring engine (brief sections 13-19). Pure, testable
functions plus a per-company orchestrator that writes LeadScore rows.

    Lead Score = clamp(Buying Evidence + Contact Access - Negative Penalty, 0, 100)

Revenue / funding / employee count are DELIBERATELY absent from Lead Score -
they feed only Expected Deal Value. No ICP, no gates, no D1-D7. Every company
is scored; a low score never disappears a company and never implies low
confidence (confidence is computed independently).
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import scoring_config as cfg
from app.core.db import async_session_maker
from app.models import BuyingEvent, Company, DecisionMaker, LeadScore
from app.services import buying_event_service as _bes
from app.services import company_batch_status

CHUNK_SIZE = 50
MAX_CHUNK_CONCURRENCY = 3

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Buying Evidence Score (brief section 13)
# --------------------------------------------------------------------------
def buying_evidence_score(positive_event_scores: list[float]) -> float:
    """Strongest three INDEPENDENT positive events, weighted [1, 0.35, 0.15],
    capped at 80. Each event here is already a unique canonical event, so
    'independent' is guaranteed by the caller passing one score per canonical
    event - extra articles about the same event never appear twice."""
    top = sorted((s for s in positive_event_scores if s and s > 0), reverse=True)[: len(cfg.EVIDENCE_WEIGHTS)]
    total = sum(score * weight for score, weight in zip(top, cfg.EVIDENCE_WEIGHTS))
    return round(min(cfg.BUYING_EVIDENCE_CAP, total), 2)


# --------------------------------------------------------------------------
# Contact Access Score (brief section 14) - scored ONCE, strongest contact only
# --------------------------------------------------------------------------
def _title_matches(title: str | None, needles: list[str]) -> bool:
    if not title:
        return False
    t = title.lower()
    return any(n in t for n in needles)


def _contact_tier(contact: dict) -> int:
    """The single contact's access score. contact: {job_title, email, phone,
    linkedin_url}. Email presence is treated as provider-supplied/verified
    (ZoomInfo) - an assumption recorded in the evidence, per brief section 14."""
    title = contact.get("job_title")
    has_email = bool(contact.get("email"))
    has_other = bool(contact.get("phone") or contact.get("mobile_phone") or contact.get("linkedin_url"))
    is_economic = _title_matches(title, cfg.ECONOMIC_BUYER_TITLES)
    is_relevant = is_economic or _title_matches(title, cfg.RELEVANT_EXEC_TITLES)

    if is_economic and has_email:
        return cfg.CONTACT_ACCESS["economic_buyer_verified_email"]
    if is_relevant and has_email:
        return cfg.CONTACT_ACCESS["relevant_exec_verified_email"]
    if is_relevant and has_other:
        return cfg.CONTACT_ACCESS["relevant_contact_no_email"]
    if contact.get("email") or has_other or title:
        return cfg.CONTACT_ACCESS["generic_company_contact"]
    return cfg.CONTACT_ACCESS["none"]


def contact_access_score(contacts: list[dict]) -> int:
    """Only the strongest reachable contact contributes - never summed across
    contacts (brief section 14)."""
    if not contacts:
        return cfg.CONTACT_ACCESS["none"]
    return max(_contact_tier(c) for c in contacts)


# --------------------------------------------------------------------------
# Negative Event Penalty (brief section 15) - each unique negative once, cap 100
# --------------------------------------------------------------------------
def negative_penalty(negative_penalties: list[float]) -> float:
    return round(min(cfg.NEGATIVE_PENALTY_CAP, sum(p for p in negative_penalties if p)), 2)


# --------------------------------------------------------------------------
# Final Lead Score (brief section 16)
# --------------------------------------------------------------------------
def final_lead_score(evidence: float, contact: float, penalty: float) -> float:
    return round(max(0.0, min(100.0, evidence + contact - penalty)), 2)


def sales_status(lead_score: float) -> str:
    for threshold, label in cfg.SALES_STATUS_BANDS:
        if lead_score >= threshold:
            return label
    return cfg.SALES_STATUS_BANDS[-1][1]


# --------------------------------------------------------------------------
# Confidence (brief section 18) - SEPARATE from Lead Score
# --------------------------------------------------------------------------
def _date_certainty(has_date: bool) -> float:
    return 1.0 if has_date else 0.6


def confidence(events: list[dict]) -> tuple[float | None, str, str]:
    """Returns (confidence_value, label, reasoning). No events ->
    (None, 'Insufficient Evidence', ...) - NOT 'low confidence'. A low Lead
    Score does not imply low confidence.

    Corroboration bonus comes from EXTRA sources on the same events
    (sum(max(0, source_count - 1)) - brief item 17), not from the number of
    independent events. company_match is a real per-event value (max source
    match), not a hardcoded 0.95."""
    positive = [e for e in events if not e.get("is_negative")]
    if not positive:
        return None, cfg.CONFIDENCE_INSUFFICIENT, "No buying events found for this company."

    per_event = []
    for e in positive:
        ec = (
            float(e.get("extraction_confidence") or 0.0)
            * float(e.get("source_quality") or 0.0)
            * _date_certainty(e.get("published_at") is not None)
            * float(e.get("company_match", 0.8))
        )
        per_event.append((float(e.get("event_score") or 0.0), ec))

    # Weight the strongest unique events (by event_score) with the same
    # 1/0.35/0.15 profile, normalised.
    per_event.sort(key=lambda x: x[0], reverse=True)
    top = per_event[: len(cfg.EVIDENCE_WEIGHTS)]
    weight_sum = sum(cfg.EVIDENCE_WEIGHTS[: len(top)])
    combined = sum(ec * w for (_, ec), w in zip(top, cfg.EVIDENCE_WEIGHTS)) / weight_sum if weight_sum else 0.0

    extra_sources = sum(max(0, int(e.get("source_count", 1)) - 1) for e in positive)
    corroboration = min(cfg.CONFIDENCE_CORROBORATION_BONUS_CAP, 0.03 * extra_sources)
    value = round(min(1.0, combined + corroboration), 3)

    label = cfg.CONFIDENCE_LABELS[-1][1]
    for threshold, lbl in cfg.CONFIDENCE_LABELS:
        if value >= threshold:
            label = lbl
            break
    reasoning = (
        f"{len(positive)} event(s), {extra_sources} corroborating source(s); "
        f"combined evidence confidence {combined:.2f} + corroboration {corroboration:.2f}."
    )
    return value, label, reasoning


# --------------------------------------------------------------------------
# Expected Deal Value (brief section 19) - SEPARATE from Lead Score
# --------------------------------------------------------------------------
def _revenue_band_index(revenue_usd: float | None) -> int | None:
    if revenue_usd is None:
        return None
    for idx, (upper, _min, _max) in enumerate(cfg.DEAL_VALUE_BANDS):
        if revenue_usd < upper:
            return idx
    return len(cfg.DEAL_VALUE_BANDS) - 1


def expected_deal_value(
    revenue_usd: float | None,
    funding_is_recent_and_relevant: bool = False,
    public_budget_usd: float | None = None,
) -> dict:
    """Cold-start revenue-capacity band (brief section 19). Funding may bump at
    most one band. A reliable explicit public AI/procurement budget takes
    precedence (only a documented capturable share of it). Returns
    {min, max, value, basis, confidence}."""
    if public_budget_usd and public_budget_usd > 0:
        capturable = public_budget_usd * cfg.PUBLIC_BUDGET_CAPTURABLE_SHARE
        return {
            "min": round(capturable * 0.6, 2),
            "max": round(capturable * 1.4, 2),
            "value": round(capturable, 2),
            "basis": "public_budget",
            "confidence": "Medium",
        }

    idx = _revenue_band_index(revenue_usd)
    if idx is None:
        band_min, band_max = cfg.DEAL_VALUE_UNKNOWN_REVENUE_BAND
        basis, dv_conf = "revenue_capacity_band_unknown_revenue", "Low"
    else:
        if funding_is_recent_and_relevant:
            idx = min(idx + cfg.FUNDING_MAX_BAND_BUMP, len(cfg.DEAL_VALUE_BANDS) - 1)
            basis, dv_conf = "revenue_capacity_band_funding_adjusted", "Medium"
        else:
            basis, dv_conf = "revenue_capacity_band", "Medium"
        _upper, band_min, band_max = cfg.DEAL_VALUE_BANDS[idx]

    return {
        "min": float(band_min),
        "max": float(band_max),
        "value": round((band_min + band_max) / 2, 2),
        "basis": basis,
        "confidence": dv_conf,
    }


def provisional_weighted_value(lead_score: float, deal_value_midpoint: float) -> float:
    """NOT a calibrated conversion probability - a provisional proxy until real
    outcome data exists (brief section 19)."""
    return round((lead_score / 100.0) * deal_value_midpoint, 2)


# --------------------------------------------------------------------------
# Orchestrator: score one company from its stored BuyingEvents + contacts
# --------------------------------------------------------------------------
_AI_RELEVANT_EVENT_TYPES = {
    "explicit_ai_budget", "ai_transformation_program", "ai_pilot_announced",
    "active_pilot", "explicit_ai_tool_adoption", "technology_budget",
    "new_tech_mandate", "relevant_ai_hiring",
}


def _funding_recent_and_relevant(company: Company, events: list[BuyingEvent], now: datetime) -> bool:
    """Funding may bump EDV only if recent AND materially relevant - proxied
    here by: a recent funding date on the company AND at least one AI/tech
    buying event (evidence the funding plausibly supports transformation).
    Conservative by design (brief section 19)."""
    fdate = company.recent_funding_date
    if fdate is None:
        return False
    if fdate.tzinfo is None:
        fdate = fdate.replace(tzinfo=timezone.utc)
    if (now - fdate).days > cfg.FUNDING_RECENT_DAYS:
        return False
    return any((e.event_type in _AI_RELEVANT_EVENT_TYPES) and not e.is_negative for e in events)


def _event_summary_row(e: BuyingEvent) -> dict:
    return {
        "event_type": e.event_type,
        "title": e.title,
        "summary": e.summary,
        "event_score": float(e.event_score) if e.event_score is not None else None,
        "best_offering": e.best_offering,
        "published_at": e.published_at.isoformat() if e.published_at else None,
        "is_negative": e.is_negative,
        "sources": len(e.evidence or []),
    }


def _max_source_match(e: BuyingEvent) -> float:
    """Real per-event company-match confidence (item 17): the strongest source
    match across this event's evidence, not a hardcoded default."""
    matches = [s.get("company_match") for s in (e.evidence or []) if isinstance(s.get("company_match"), (int, float))]
    return max(matches) if matches else 0.8


async def score_company(session: AsyncSession, company: Company, now: datetime) -> LeadScore:
    """Computes and upserts the LeadScore for one company from its stored
    BuyingEvents and contacts. Legacy gate/D1-D7 columns are left NULL.

    Freshness and event_score are RECOMPUTED from published_at every run
    (item 8), and the refreshed values persisted - so an event naturally loses
    influence as it ages and eventually hits zero past the window. Stale events
    (not rediscovered in the latest research run - item 10) are excluded from
    the live score entirely."""
    all_events = (
        await session.execute(select(BuyingEvent).where(BuyingEvent.company_id == company.company_id))
    ).scalars().all()
    contacts = (
        await session.execute(select(DecisionMaker).where(DecisionMaker.company_id == company.company_id))
    ).scalars().all()

    # Recompute freshness + event_score from published_at, persist, and drop
    # stale events from the live score.
    for e in all_events:
        fresh = _bes.freshness_factor(e.published_at, now)
        e.freshness = fresh
        if not e.is_negative:
            e.event_score = _bes.compute_event_score(
                float(e.base_strength or 0), float(e.relevance or 0), fresh,
                float(e.source_quality or 0), float(e.extraction_confidence or 0),
                float(e.status_factor or 0),
            )
    events = [e for e in all_events if not e.is_stale]

    positive = [e for e in events if not e.is_negative]
    negatives = [e for e in events if e.is_negative]

    be = buying_evidence_score([float(e.event_score or 0) for e in positive])
    ca = contact_access_score(
        [
            {"job_title": c.job_title, "email": c.email, "phone": c.phone,
             "mobile_phone": c.mobile_phone, "linkedin_url": c.linkedin_url}
            for c in contacts
        ]
    )
    neg = negative_penalty([float(e.penalty_value or 0) for e in negatives])
    score = final_lead_score(be, ca, neg)
    status = sales_status(score)

    conf_value, conf_label, conf_reason = confidence(
        [
            {"extraction_confidence": e.extraction_confidence, "source_quality": e.source_quality,
             "published_at": e.published_at, "event_score": e.event_score, "is_negative": e.is_negative,
             "source_count": len(e.evidence or []), "company_match": _max_source_match(e)}
            for e in events
        ]
    )

    # Public-budget EDV takes precedence when an event carries an explicit,
    # relevant budget (item 18); else revenue band + tightened funding bump.
    budgets = [float(e.public_budget_usd) for e in positive if e.public_budget_usd]
    edv = expected_deal_value(
        float(company.revenue_usd) if company.revenue_usd is not None else None,
        funding_is_recent_and_relevant=_funding_recent_and_relevant(company, events, now),
        public_budget_usd=max(budgets) if budgets else None,
    )
    weighted = provisional_weighted_value(score, edv["value"])

    # Best offering / why-now / action come from the strongest positive event.
    strongest = max(positive, key=lambda e: float(e.event_score or 0), default=None)
    best_offering = strongest.best_offering if strongest else None
    why_now = strongest.summary if strongest else None
    recommended_action = (
        f"Lead with {best_offering}: {strongest.reasoning}" if strongest and strongest.reasoning else None
    )

    warnings = []
    if not events:
        warnings.append("no_buying_events")
    if company.revenue_usd is None:
        warnings.append("unknown_revenue")

    values = dict(
        # New pipeline
        buying_evidence_score=be,
        contact_access_score=ca,
        negative_event_score=neg,
        lead_score=score,
        sales_status=status,
        evidence_confidence=conf_value,
        confidence_label=conf_label,
        best_offering=best_offering,
        why_now=why_now,
        recommended_action=recommended_action,
        evidence_summary=[_event_summary_row(e) for e in sorted(events, key=lambda e: float(e.event_score or 0), reverse=True)],
        expected_deal_min_usd=edv["min"],
        expected_deal_max_usd=edv["max"],
        expected_deal_value_usd=edv["value"],
        expected_revenue_usd=weighted,
        deal_value_basis=edv["basis"],
        deal_value_confidence=edv["confidence"],
        commercially_viable=edv["value"] >= cfg.COMMERCIAL_VIABILITY_THRESHOLD_USD,
        score_version=cfg.SCORE_VERSION,
        score_formula_version=cfg.SCORE_FORMULA_VERSION,
        scoring_warnings=warnings or None,
        # Legacy gate/D1-D7 columns explicitly NULLed (brief section 20)
        gate_check_1=None, gate_check_2=None, gate_check_3=None, gate_check_4=None, gate_check_5=None,
        gate_passed=None, gate_status=None,
        d1_pain_acuity=None, d2_ai_intent=None, d3_economic_capacity=None, d4_authority=None,
        d5_timing_catalyst=None, d6_solution_fit=None, d7_competitive=None, component_score=None,
        p_convert=None, deal_tier=None, p_score=None, recency_factor=None,
        d1_reasoning=None, d2_reasoning=None, d5_reasoning=None,
        scored_at=now,
    )

    existing = (
        await session.execute(select(LeadScore).where(LeadScore.company_id == company.company_id))
    ).scalar_one_or_none()
    if existing is None:
        existing = LeadScore(company_id=company.company_id, **values)
        session.add(existing)
    else:
        for k, v in values.items():
            setattr(existing, k, v)
    return existing


# Sales-status count keys used to update an import batch's counters.
STATUS_TO_COUNT = {
    "Sales Ready": "sales_ready_count",
    "High Priority": "high_priority_count",
    "Warm": "warm_count",
    "Monitor": "monitor_count",
    "Low Priority": "low_priority_count",
}


async def _score_chunk(company_ids: list, now: datetime, import_batch_id=None) -> dict:
    """One chunk's lifecycle: own session, own commit - so results appear
    progressively in GET /scores/ranked during a large run. Each company is
    scored independently (try/except per company, not per chunk) so one bad
    company's exception can't drop every other company's score in the same
    chunk of up to CHUNK_SIZE."""
    counts = {label: 0 for label in STATUS_TO_COUNT}
    async with async_session_maker() as session:
        companies = (
            await session.execute(select(Company).where(Company.company_id.in_(company_ids)))
        ).scalars().all()
        for company in companies:
            try:
                await score_company(session, company, now)
                await company_batch_status.mark_completed(session, company.company_id, import_batch_id)
            except Exception as exc:
                logger.exception(
                    "company scoring raised: %s",
                    exc,
                    extra={"company_id": str(company.company_id), "job_id": str(import_batch_id) if import_batch_id else "-", "stage": "scoring"},
                )
                await company_batch_status.mark_failed(
                    session, company.company_id, import_batch_id, f"Scoring failed: {exc}", permanent=False,
                )
        # Flush so both inserts and updates are visible to the tally re-read
        # (score_company adds new rows and mutates existing ones in place).
        await session.flush()
        # Tally statuses after flush so both inserts and updates are counted.
        scored = (
            await session.execute(
                select(LeadScore.sales_status).where(LeadScore.company_id.in_(company_ids))
            )
        ).scalars().all()
        for st in scored:
            if st in counts:
                counts[st] += 1
        await session.commit()
    return counts


async def run_scoring(session: AsyncSession, organisation_id, company_ids=None, import_batch_id=None) -> dict:
    """Scores every company in the org (or just company_ids) from its stored
    BuyingEvents. Chunked with bounded concurrency, each chunk committing
    independently. Returns per-sales-status counts. No ICP, no gates - every
    company gets a score."""
    stmt = select(Company.company_id).where(Company.organisation_id == organisation_id)
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    ids = [cid for cid in (await session.execute(stmt)).scalars().all()]
    if not ids:
        return {label: 0 for label in STATUS_TO_COUNT}

    chunks = [ids[i : i + CHUNK_SIZE] for i in range(0, len(ids), CHUNK_SIZE)]
    now = datetime.now(timezone.utc)
    semaphore = asyncio.Semaphore(MAX_CHUNK_CONCURRENCY)

    async def _bounded(chunk):
        async with semaphore:
            return await _score_chunk(chunk, now, import_batch_id)

    results = await asyncio.gather(*[_bounded(c) for c in chunks])
    totals = {label: 0 for label in STATUS_TO_COUNT}
    for r in results:
        for label, n in r.items():
            totals[label] += n
    return totals
