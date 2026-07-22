from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedFirebaseUser, require_firebase_user
from app.core.db import get_db
from app.models import User, WorkspaceMember
from app.schemas.auth import CurrentUserOut


async def me(
    db: AsyncSession = Depends(get_db),
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
) -> CurrentUserOut:
    user = (
        await db.execute(select(User).where(User.firebase_uid == firebase_user.uid))
    ).scalar_one_or_none()

    if user is None and firebase_user.email:
        # No row for this exact Firebase UID, but app_user.email is globally
        # unique (see app/models/user.py) - if this email already has a row
        # under a *different* UID (a recreated Firebase account, a re-login
        # via a different provider, etc.), it's the same real account. Without
        # this fallback, onboarding treated it as brand new, created a fresh
        # Organisation + Workspace, and only then failed on createUser's
        # unique-email constraint - three steps too late, leaving orphaned
        # Organisation/Workspace rows behind. Backfilling firebase_uid here
        # heals the mismatch so future logins resolve on the fast path above.
        user = (
            await db.execute(select(User).where(User.email == firebase_user.email))
        ).scalar_one_or_none()
        if user is not None:
            user.firebase_uid = firebase_user.uid
            await db.commit()
            await db.refresh(user)

    if user is None:
        # No app_user row tied to this Firebase account or email yet - a
        # genuinely brand new signup.
        return CurrentUserOut(has_account=False)

    # A user can belong to multiple workspaces (Sales AND Marketing, etc.) -
    # oldest membership first is a reasonable default "home" workspace to
    # land on; WorkspaceSwitcher lets them pick a different one afterward.
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
    )
