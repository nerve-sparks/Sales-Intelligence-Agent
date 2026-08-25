from uuid import UUID
from collections import defaultdict

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import BuyingEvent, Company, CompanyImportBatch, DecisionMaker, LeadScore
from app.schemas.score import BuyingEventOut, NotScoredOut, ScoreDetailOut
from app.services.evidence_scorer import _contact_tier, run_scoring


def _in_batch(import_batch_id: UUID):
    """Company-in-batch predicate via the permanent membership table (item 5),
    NOT Company.import_batch_id (which a later re-upload overwrites) - same
    predicate as company_directory.py / buying_event_directory.py."""
    return Company.company_id.in_(
        select(CompanyImportBatch.company_id).where(CompanyImportBatch.import_batch_id == import_batch_id)
    )


def _primary_contact(dms: list[DecisionMaker]) -> tuple[str | None, str | None]:
    """Strongest reachable contact for a company - same tiering as Contact Access
    scoring, so the Dashboard mail action targets the person who drove the score."""
    if not dms:
        return None, None
    best = max(
        dms,
        key=lambda d: _contact_tier(
            {
                "job_title": d.job_title,
                "email": d.email,
                "phone": d.phone,
                "mobile_phone": d.mobile_phone,
                "linkedin_url": d.linkedin_url,
            }
        ),
    )
    name = " ".join(p for p in (best.first_name, best.last_name) if p) or None
    return best.email, name


async def run(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Re-scores the org (or one upload's companies) from stored BuyingEvents.
    No ICP (brief section 22). Returns per-sales-status counts."""
    company_ids = None
    if import_batch_id is not None:
        company_ids = (
            await db.execute(
                select(Company.company_id).where(
                    Company.organisation_id == organisation_id,
                    _in_batch(import_batch_id),
                )
            )
        ).scalars().all()
    counts = await run_scoring(db, organisation_id, company_ids=company_ids)
    return {
        "sales_ready": counts["Sales Ready"],
        "high_priority": counts["High Priority"],
        "warm": counts["Warm"],
        "monitor": counts["Monitor"],
        "low_priority": counts["Low Priority"],
    }


async def ranked(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Every scored company (brief section 22) - NO gate filter. Ordered by
    lead score, then confidence, then most-recent score, then name."""
    stmt = (
        select(Company.company_id, Company.company_name, LeadScore)
        .join(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
        .order_by(
            LeadScore.lead_score.desc().nullslast(),
            LeadScore.evidence_confidence.desc().nullslast(),
            LeadScore.scored_at.desc().nullslast(),
            Company.company_name.asc(),
        )
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    rows = (await db.execute(stmt)).all()

    contacts_by_company: dict = defaultdict(list)
    company_ids = [company_id for company_id, _, _ in rows]
    if company_ids:
        dms = (
            await db.execute(select(DecisionMaker).where(DecisionMaker.company_id.in_(company_ids)))
        ).scalars().all()
        for dm in dms:
            contacts_by_company[dm.company_id].append(dm)

    out = []
    for company_id, company_name, ls in rows:
        email, contact_name = _primary_contact(contacts_by_company.get(company_id, []))
        out.append(
            {
                "company_id": company_id,
                "company_name": company_name,
                "lead_score": float(ls.lead_score) if ls.lead_score is not None else None,
                "sales_status": ls.sales_status,
                "confidence_label": ls.confidence_label,
                "buying_evidence_score": float(ls.buying_evidence_score) if ls.buying_evidence_score is not None else None,
                "contact_access_score": float(ls.contact_access_score) if ls.contact_access_score is not None else None,
                "negative_event_score": float(ls.negative_event_score) if ls.negative_event_score is not None else None,
                "best_offering": ls.best_offering,
                "why_now": ls.why_now,
                "expected_deal_min_usd": float(ls.expected_deal_min_usd) if ls.expected_deal_min_usd is not None else None,
                "expected_deal_max_usd": float(ls.expected_deal_max_usd) if ls.expected_deal_max_usd is not None else None,
                "expected_deal_value_usd": float(ls.expected_deal_value_usd) if ls.expected_deal_value_usd is not None else None,
                "scored_at": ls.scored_at,
                "primary_contact_email": email,
                "primary_contact_name": contact_name,
            }
        )
    return out


async def get_score(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    """Full evidence-based score for one company, including its canonical
    events with source URLs (brief section 21)."""
    stmt = (
        select(LeadScore)
        .join(Company, Company.company_id == LeadScore.company_id)
        .where(LeadScore.company_id == company_id, Company.organisation_id == organisation_id)
    )
    score = (await db.execute(stmt)).scalar_one_or_none()
    if score is None:
        return NotScoredOut(detail="not scored yet")
    events = (
        await db.execute(
            select(BuyingEvent)
            .where(BuyingEvent.company_id == company_id)
            .order_by(BuyingEvent.event_score.desc().nullslast())
        )
    ).scalars().all()
    out = ScoreDetailOut.model_validate(score)
    out.events = [BuyingEventOut.model_validate(e) for e in events]
    return out
