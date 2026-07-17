"""Read-only company/decision-maker directory queries - not scoped to an
ICP's filter criteria (see icp_filter.py for that), just plain org-wide
listing/lookup for pages like Enterprise List/Detail and Buying Committee.
"""

from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, DecisionMaker, LeadScore

# Same tiers the Enterprise List's row badges use (frontend toEnterprise()):
# >=80 high, >=60 medium, everything else (incl. unscored/nurture) low.
HIGH_SCORE = 80
MEDIUM_SCORE = 60


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

    stmt = (
        stmt.order_by(LeadScore.lead_score.desc().nulls_last(), Company.company_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()
    return rows, total


async def intent_counts(session: AsyncSession, organisation_id: UUID) -> dict[str, int]:
    tier = case(
        (LeadScore.lead_score >= HIGH_SCORE, "high"),
        (LeadScore.lead_score >= MEDIUM_SCORE, "medium"),
        else_="low",
    )
    stmt = (
        select(tier.label("tier"), func.count())
        .select_from(Company)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
        .group_by(tier)
    )
    rows = (await session.execute(stmt)).all()
    counts = {"high": 0, "medium": 0, "low": 0}
    counts.update(dict(rows))
    return counts


async def list_companies_for_export(
    session: AsyncSession, organisation_id: UUID, company_ids: set[UUID] | None = None
):
    """Every matching company with its full LeadScore row (not just
    lead_score/gate_status like list_companies) - feeds the Enterprise
    List's "Export" button. company_ids narrows to an ICP-filtered set when
    the page has one selected; None means every company in the org."""
    stmt = (
        select(Company, LeadScore)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    stmt = stmt.order_by(LeadScore.lead_score.desc().nulls_last(), Company.company_name)
    return (await session.execute(stmt)).all()


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
