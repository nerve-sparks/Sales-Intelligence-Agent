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
    if user is None:
        # No app_user row tied to this Firebase account yet - a brand new
        # signup, or one from before firebase_uid existed on old rows.
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
