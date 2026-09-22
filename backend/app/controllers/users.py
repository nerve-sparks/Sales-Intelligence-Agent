from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedAuthUser, require_auth_user
from app.core.db import get_db
from app.models import User
from app.services.user_service import create_user, update_user


class UserCreate(BaseModel):
    email: str
    full_name: str | None = None
    designation: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    designation: str | None = None


async def create(
    organisation_id: UUID,
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    auth_user: VerifiedAuthUser = Depends(require_auth_user),
):
    # Client-submitted email is display convenience — verified token is source
    # of truth. firebase_uid stores the gateway `sub`.
    values = payload.model_dump()
    values["email"] = auth_user.email or values["email"]
    values["firebase_uid"] = auth_user.uid
    try:
        return await create_user(db, organisation_id, values)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A user with this email already exists.")


async def update(
    organisation_id: UUID,
    user_id: UUID,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    auth_user: VerifiedAuthUser = Depends(require_auth_user),
):
    caller = (
        await db.execute(select(User).where(User.firebase_uid == auth_user.uid))
    ).scalar_one_or_none()
    if caller is None or caller.user_id != user_id or caller.organisation_id != organisation_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this user")

    user = await update_user(db, user_id, payload.model_dump(exclude_unset=True))
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return user
