from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedFirebaseUser, require_firebase_user
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
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
):
    # The client-submitted email is just a display convenience (frontend
    # locks it to the logged-in Firebase account already) - the verified
    # token is the actual source of truth, so this row is tied to whoever
    # really authenticated, not whatever the request body claims.
    values = payload.model_dump()
    values["email"] = firebase_user.email or values["email"]
    values["firebase_uid"] = firebase_user.uid
    try:
        return await create_user(db, organisation_id, values)
    except IntegrityError:
        # app_user.email/firebase_uid are each unique across the whole
        # table, not just this organisation - the commit already failed and
        # rolled back nothing on its own, so roll back explicitly before the
        # session gets reused.
        await db.rollback()
        raise HTTPException(status_code=409, detail="A user with this email already exists.")


async def update(
    organisation_id: UUID,
    user_id: UUID,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
):
    # Self-edit only, same pattern as add_workspace_member: the caller's own
    # resolved identity must match both the path's user_id and
    # organisation_id - nobody can edit a teammate's profile through this,
    # only their own (there's no "admin edits member" flow in this app).
    caller = (
        await db.execute(select(User).where(User.firebase_uid == firebase_user.uid))
    ).scalar_one_or_none()
    if caller is None or caller.user_id != user_id or caller.organisation_id != organisation_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this user")

    user = await update_user(db, user_id, payload.model_dump(exclude_unset=True))
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    return user
