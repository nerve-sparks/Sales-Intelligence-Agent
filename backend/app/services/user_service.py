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


async def update_user(session: AsyncSession, user_id: UUID, values: dict) -> User | None:
    user = await session.get(User, user_id)
    if user is None:
        return None
    for key, value in values.items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user
