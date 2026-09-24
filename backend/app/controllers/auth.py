from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedAuthUser, require_auth_user
from app.core.db import get_db
from app.models import User, WorkspaceMember
from app.schemas.auth import CurrentUserOut


async def me(
    db: AsyncSession = Depends(get_db),
    auth_user: VerifiedAuthUser = Depends(require_auth_user),
) -> CurrentUserOut:
    user = (
        await db.execute(select(User).where(User.firebase_uid == auth_user.uid))
    ).scalar_one_or_none()

    if user is None and auth_user.email:
        # No row for this gateway subject, but app_user.email is globally
        # unique - if this email already has a row under a different uid
        # (migrated from Firebase, re-login, etc.), treat it as the same
        # account and backfill firebase_uid with the gateway `sub`.
        user = (
            await db.execute(select(User).where(User.email == auth_user.email))
        ).scalar_one_or_none()
        if user is not None:
            user.firebase_uid = auth_user.uid
            await db.commit()
            await db.refresh(user)

    if user is None:
        return CurrentUserOut(has_account=False)

    membership = (
        await db.execute(
            select(WorkspaceMember)
            .where(WorkspaceMember.user_id == user.user_id)
            .order_by(WorkspaceMember.created_at)
        )
    ).scalars().first()

    return CurrentUserOut(
        has_account=True,
        organisation_id=user.organisation_id,
        workspace_id=membership.workspace_id if membership else None,
        user_id=user.user_id,
        email=user.email,
        full_name=user.full_name,
        designation=user.designation,
    )
