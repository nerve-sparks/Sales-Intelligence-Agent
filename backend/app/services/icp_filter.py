from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, DecisionMaker, IcpProfile


async def create_icp(session: AsyncSession, values: dict) -> IcpProfile:
    icp = IcpProfile(**values)
    session.add(icp)
    await session.commit()
    await session.refresh(icp)
    return icp


async def get_icp(session: AsyncSession, icp_id: UUID) -> IcpProfile | None:
    return await session.get(IcpProfile, icp_id)


async def filter_companies(session: AsyncSession, icp: IcpProfile) -> list[Company]:
    stmt = select(Company).options(selectinload(Company.decision_makers))

    if icp.industries:
        stmt = stmt.where(
            Company.primary_industry.op("&&")(icp.industries)
            | Company.industries.op("&&")(icp.industries)
        )
    if icp.employee_min is not None:
        stmt = stmt.where(Company.employee_count >= icp.employee_min)
    if icp.employee_max is not None:
        stmt = stmt.where(Company.employee_count <= icp.employee_max)
    if icp.revenue_min_usd is not None:
        stmt = stmt.where(Company.revenue_usd >= icp.revenue_min_usd)
    if icp.revenue_max_usd is not None:
        stmt = stmt.where(Company.revenue_usd <= icp.revenue_max_usd)
    if icp.countries:
        stmt = stmt.where(Company.country.in_(icp.countries))
    if icp.technologies:
        stmt = stmt.where(Company.technologies.op("&&")(icp.technologies))
    if icp.buying_committee_personas:
        subq = select(DecisionMaker.company_id).where(
            DecisionMaker.persona.in_(icp.buying_committee_personas)
        )
        stmt = stmt.where(Company.company_id.in_(subq))

    result = await session.execute(stmt)
    return result.scalars().unique().all()
