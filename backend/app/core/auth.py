"""Auth for API requests: verify NervesParks auth-gateway JWTs, then resolve
local app_user membership for tenant-scoped routes.

require_auth_user proves *someone* is logged in (gateway JWT valid) - used on
tenant-creation endpoints where there may be no membership row yet.

require_organisation_member / require_workspace_member resolve the verified
caller to a local app_user row and confirm organisation/workspace membership.
Authorization (roles, ownership) stays in this DB, not in JWT claims.
"""

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.jwt_auth import verify_auth_gateway_token
from app.models import User, WorkspaceMember


@dataclass
class VerifiedAuthUser:
    """Caller identity from a verified auth-gateway JWT.

    `uid` is the gateway subject (`sub`) — stored on app_user.firebase_uid
    (column name is historical; value is the gateway user id).
    """

    uid: str
    email: str | None


def _email_from_claims(claims: dict) -> str | None:
    email = claims.get("email")
    if isinstance(email, str) and email.strip():
        return email.strip()
    # Some gateway deployments nest profile fields.
    for key in ("preferred_username", "username"):
        value = claims.get(key)
        if isinstance(value, str) and "@" in value:
            return value.strip()
    return None


async def require_auth_user(authorization: str | None = Header(default=None)) -> VerifiedAuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    claims = await verify_auth_gateway_token(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    sub = claims.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    return VerifiedAuthUser(uid=sub, email=_email_from_claims(claims))


# Back-compat aliases while call sites migrate — same dependency.
VerifiedFirebaseUser = VerifiedAuthUser
require_firebase_user = require_auth_user


async def _resolve_user(db: AsyncSession, auth_user: VerifiedAuthUser) -> User | None:
    return (
        await db.execute(select(User).where(User.firebase_uid == auth_user.uid))
    ).scalar_one_or_none()


async def require_organisation_member(
    organisation_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_user: VerifiedAuthUser = Depends(require_auth_user),
) -> User:
    user = await _resolve_user(db, auth_user)
    if user is None or user.organisation_id != organisation_id:
        raise HTTPException(status_code=403, detail="Not authorized for this organisation")
    return user


async def require_workspace_member(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_user: VerifiedAuthUser = Depends(require_auth_user),
) -> User:
    user = await _resolve_user(db, auth_user)
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
