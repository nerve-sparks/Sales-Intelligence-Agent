from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, LeadScore
from app.services.lead_scorer import run_scoring
from app.views.score_view import serialize_lead_score, serialize_ranked_lead_score

router = APIRouter(prefix="/scores", tags=["scores"])


@router.post("/run")
async def run(db: AsyncSession = Depends(get_db)):
    return await run_scoring(db)


@router.get("/ranked")
async def ranked(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Company.company_name, LeadScore.lead_score, LeadScore.component_score, LeadScore.gate_status)
        .join(LeadScore, LeadScore.company_id == Company.company_id)
        .where(LeadScore.gate_passed.is_(True))
        .order_by(LeadScore.lead_score.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [serialize_ranked_lead_score(r) for r in rows]


@router.get("/{company_id}")
async def get_score(company_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(LeadScore).where(LeadScore.company_id == company_id)
    score = (await db.execute(stmt)).scalar_one_or_none()
    if score is None:
        return {"detail": "not scored yet"}
    return serialize_lead_score(score)
