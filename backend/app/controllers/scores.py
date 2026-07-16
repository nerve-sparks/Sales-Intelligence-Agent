from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, LeadScore
from app.services.lead_scorer import run_scoring
from app.schemas.score import NotScoredOut


async def run(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    return await run_scoring(db, organisation_id)


async def ranked(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Company.company_name, LeadScore.lead_score, LeadScore.component_score, LeadScore.gate_status)
        .join(LeadScore, LeadScore.company_id == Company.company_id)
        .where(LeadScore.gate_passed.is_(True), Company.organisation_id == organisation_id)
        .order_by(LeadScore.lead_score.desc())
    )
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
