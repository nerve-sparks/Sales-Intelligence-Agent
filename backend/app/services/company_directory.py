"""Read-only company/decision-maker directory queries - not scoped to an
ICP's filter criteria (see icp_filter.py for that), just plain org-wide
listing/lookup for pages like Enterprise List/Detail and Buying Committee.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, DecisionMaker, LeadScore


async def list_companies(
    session: AsyncSession, organisation_id: UUID, page: int, page_size: int, search: str | None = None
):
    stmt = (
        select(Company, LeadScore.lead_score, LeadScore.gate_status)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    if search:
        stmt = stmt.where(Company.company_name.ilike(f"%{search}%"))

    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = stmt.order_by(Company.company_name).offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(stmt)).all()
    return rows, total


async def get_company(session: AsyncSession, organisation_id: UUID, company_id: UUID) -> Company | None:
    stmt = (
        select(Company)
        .options(selectinload(Company.decision_makers))
        .where(Company.company_id == company_id, Company.organisation_id == organisation_id)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_decision_makers(
    session: AsyncSession, organisation_id: UUID, company_id: UUID
) -> list[DecisionMaker]:
    stmt = select(DecisionMaker).where(
        DecisionMaker.company_id == company_id, DecisionMaker.organisation_id == organisation_id
    )
    return (await session.execute(stmt)).scalars().all()


async def get_decision_maker(
    session: AsyncSession, organisation_id: UUID, decision_maker_id: UUID
) -> DecisionMaker | None:
    stmt = select(DecisionMaker).where(
        DecisionMaker.decision_maker_id == decision_maker_id,
        DecisionMaker.organisation_id == organisation_id,
    )
    return (await session.execute(stmt)).scalar_one_or_none()
