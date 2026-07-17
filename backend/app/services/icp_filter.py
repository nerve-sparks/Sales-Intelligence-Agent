from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, DecisionMaker, IcpProfile, Workspace


async def create_icp(session: AsyncSession, workspace_id: UUID, values: dict) -> IcpProfile:
    icp = IcpProfile(workspace_id=workspace_id, **values)
    session.add(icp)
    await session.commit()
    await session.refresh(icp)
    return icp


async def get_icp(session: AsyncSession, workspace_id: UUID, icp_id: UUID) -> IcpProfile | None:
    stmt = select(IcpProfile).where(
        IcpProfile.icp_id == icp_id, IcpProfile.workspace_id == workspace_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_icps(session: AsyncSession, workspace_id: UUID) -> list[IcpProfile]:
    stmt = (
        select(IcpProfile)
        .where(IcpProfile.workspace_id == workspace_id)
        .order_by(IcpProfile.created_at.desc())
    )
    return (await session.execute(stmt)).scalars().all()


async def get_icp_by_organisation(session: AsyncSession, organisation_id: UUID, icp_id: UUID) -> IcpProfile | None:
    """Same lookup as get_icp, but for organisation-scoped routes (e.g. the
    Enterprise List export) that only have organisation_id, not workspace_id,
    in the path - joins through Workspace to confirm the ICP actually
    belongs to this organisation."""
    stmt = (
        select(IcpProfile)
        .join(Workspace, Workspace.workspace_id == IcpProfile.workspace_id)
        .where(IcpProfile.icp_id == icp_id, Workspace.organisation_id == organisation_id)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def filter_companies(session: AsyncSession, icp: IcpProfile) -> list[Company]:
    # An ICP's Workspace belongs to exactly one Organisation - companies are
    # shared across all Workspaces in that Organisation, so scope by
    # organisation_id (via the workspace), not by workspace_id directly.
    workspace = await session.get(Workspace, icp.workspace_id)

    stmt = (
        select(Company)
        .options(selectinload(Company.decision_makers))
        .where(Company.organisation_id == workspace.organisation_id)
    )

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
