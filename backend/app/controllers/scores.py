from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, LeadScore
from app.services import icp_filter
from app.services.lead_scorer import run_scoring
from app.schemas.score import NotScoredOut


async def run(organisation_id: UUID, icp_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Re-scores the org. icp_id, when given, drives D6 (ICP-fit) for every
    company being scored - not just companies from that ICP's own upload -
    so ranking genuinely reflects fit-to-the-chosen-ICP across the whole
    org, rather than whatever ICP happened to be active when each company
    last got scored."""
    icp = None
    if icp_id is not None:
        icp = await icp_filter.get_icp_by_organisation(db, organisation_id, icp_id)
        if icp is None:
            raise HTTPException(status_code=404, detail="icp not found")
    return await run_scoring(db, organisation_id, icp=icp)


async def ranked(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Company.company_name, LeadScore.lead_score, LeadScore.component_score, LeadScore.gate_status)
        .join(LeadScore, LeadScore.company_id == Company.company_id)
        .where(LeadScore.gate_passed.is_(True), Company.organisation_id == organisation_id)
        .order_by(LeadScore.lead_score.desc(), LeadScore.p_score.desc())
    )
    if import_batch_id is not None:
        stmt = stmt.where(Company.import_batch_id == import_batch_id)
    return (await db.execute(stmt)).all()


async def get_score(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(LeadScore)
        .join(Company, Company.company_id == LeadScore.company_id)
        .where(LeadScore.company_id == company_id, Company.organisation_id == organisation_id)
    )
    score = (await db.execute(stmt)).scalar_one_or_none()
    if score is None:
        return NotScoredOut(detail="not scored yet")
    return score
