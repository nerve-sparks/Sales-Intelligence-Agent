from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Organisation


async def create_organisation(session: AsyncSession, values: dict) -> Organisation:
    org = Organisation(**values)
    session.add(org)
    await session.commit()
    await session.refresh(org)
    return org


async def get_organisation(session: AsyncSession, organisation_id: UUID) -> Organisation | None:
    return await session.get(Organisation, organisation_id)


async def update_organisation(session: AsyncSession, organisation_id: UUID, values: dict) -> Organisation | None:
    """Partial update - callers pass model_dump(exclude_unset=True) so only
    fields the caller actually sent are touched. Settings' Organization panel
    only collects a subset of onboarding's fields (Company Name, Website,
    Legal Business Name, Industry, Headquarters Location, Company
    Description, Account Logo); the rest (timezone/currency/employee_count_
    range/etc, still real columns) are left exactly as onboarding set them."""
    org = await session.get(Organisation, organisation_id)
    if org is None:
        return None
    for key, value in values.items():
        setattr(org, key, value)
    await session.commit()
    await session.refresh(org)
    return org
