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
