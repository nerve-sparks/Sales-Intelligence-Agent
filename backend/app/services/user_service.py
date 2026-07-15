from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def create_user(session: AsyncSession, organisation_id: UUID, values: dict) -> User:
    user = User(organisation_id=organisation_id, **values)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def get_user(session: AsyncSession, user_id: UUID) -> User | None:
    return await session.get(User, user_id)
