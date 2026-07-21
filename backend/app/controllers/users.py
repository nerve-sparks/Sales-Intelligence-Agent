from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedFirebaseUser, require_firebase_user
from app.core.db import get_db
from app.services.user_service import create_user


class UserCreate(BaseModel):
    email: str
    full_name: str | None = None


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
