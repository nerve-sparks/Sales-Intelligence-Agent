"""Verifies the Firebase ID token the frontend attaches to every request
(see frontend/src/api/client.ts) - the only thing standing between "a
Firebase account is logged in" and "the backend accepts requests from
anyone" (previously nothing did).

require_firebase_user just proves *someone* is logged in - used on the
tenant-creation endpoints (create organisation/workspace/user, add workspace
member), where there's often no existing membership row yet to check against.

require_organisation_member/require_workspace_member go a step further: they
resolve the verified Firebase account to its real app_user row and confirm
it's actually tied to the organisation_id/workspace_id in the request's path
- these gate every other tenant-scoped endpoint (companies, signals, scores,
triggers, ICPs, zoominfo enrichment), so a valid login for someone else's
account can no longer read or write a different organisation's data just by
knowing/guessing its UUID.
"""

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from firebase_admin import auth as firebase_auth
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import User, WorkspaceMember
from app.services.firebase_client import FirebaseNotConfiguredError, get_firebase_app


@dataclass
class VerifiedFirebaseUser:
    uid: str
    email: str | None


async def require_firebase_user(authorization: str | None = Header(default=None)) -> VerifiedFirebaseUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        app = get_firebase_app()
    except FirebaseNotConfiguredError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        decoded = firebase_auth.verify_id_token(token, app=app)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    return VerifiedFirebaseUser(uid=decoded["uid"], email=decoded.get("email"))


async def _resolve_user(db: AsyncSession, firebase_user: VerifiedFirebaseUser) -> User | None:
    return (
        await db.execute(select(User).where(User.firebase_uid == firebase_user.uid))
    ).scalar_one_or_none()


async def require_organisation_member(
    organisation_id: UUID,
    db: AsyncSession = Depends(get_db),
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
) -> User:
    user = await _resolve_user(db, firebase_user)
    if user is None or user.organisation_id != organisation_id:
        raise HTTPException(status_code=403, detail="Not authorized for this organisation")
    return user


async def require_workspace_member(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
) -> User:
    user = await _resolve_user(db, firebase_user)
    if user is None:
        raise HTTPException(status_code=403, detail="Not authorized for this workspace")
    membership = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.user_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=403, detail="Not authorized for this workspace")
    return user
