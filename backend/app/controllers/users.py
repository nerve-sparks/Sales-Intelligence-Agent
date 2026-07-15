from uuid import UUID

from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.user_service import create_user
from app.views.user_view import serialize_user


class UserCreate(BaseModel):
    email: str
    full_name: str | None = None


async def create(organisation_id: UUID, payload: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await create_user(db, organisation_id, payload.model_dump())
    return serialize_user(user)
