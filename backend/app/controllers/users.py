from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.user_service import create_user


class UserCreate(BaseModel):
    email: str
    full_name: str | None = None


async def create(organisation_id: UUID, payload: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await create_user(db, organisation_id, payload.model_dump())
    except IntegrityError:
        # app_user.email is unique across the whole table, not just this
        # organisation - the commit already failed and rolled back nothing
        # on its own, so roll back explicitly before the session gets reused.
        await db.rollback()
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
