from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    VerifiedFirebaseUser,
    require_firebase_user,
    require_organisation_member,
    require_workspace_member,
)
from app.core.db import get_db
from app.models import User, Workspace
from app.services.workspace_service import add_member, create_workspace, list_members, list_workspaces
from app.schemas.workspace import MemberOut


class WorkspaceCreate(BaseModel):
    workspace_name: str
    purpose: str | None = None


class MemberCreate(BaseModel):
    user_id: UUID
    role: str = "member"


async def create(
    organisation_id: UUID,
    payload: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
):
    # Two legitimate callers: (a) an existing member of this organisation
    # creating an additional department workspace (Settings' "+ New
    # Workspace"), or (b) onboarding creating the very first workspace for a
    # brand-new organisation - at that point createUser hasn't run yet, so
    # there's no app_user row to match against. Anyone else (a different
    # org's member, or a stranger guessing this organisation_id) is rejected.
    user = (await db.execute(select(User).where(User.firebase_uid == firebase_user.uid))).scalar_one_or_none()
    if user is not None:
        if user.organisation_id != organisation_id:
            raise HTTPException(status_code=403, detail="Not authorized for this organisation")
    else:
        existing_users = (
            await db.execute(
                select(func.count()).select_from(User).where(User.organisation_id == organisation_id)
            )
        ).scalar_one()
        if existing_users > 0:
            raise HTTPException(status_code=403, detail="This organisation already has an owner")
    return await create_workspace(db, organisation_id, payload.model_dump())


async def list_all(
    organisation_id: UUID,
    db: AsyncSession = Depends(get_db),
    _member: User = Depends(require_organisation_member),
):
    return await list_workspaces(db, organisation_id)


def _member_out(member) -> MemberOut:
    return MemberOut(
        workspace_member_id=member.workspace_member_id,
        workspace_id=member.workspace_id,
        user_id=member.user_id,
        email=member.user.email if member.user else None,
        full_name=member.user.full_name if member.user else None,
        role=member.role,
        created_at=member.created_at,
    )


async def add_workspace_member(
    workspace_id: UUID,
    payload: MemberCreate,
    db: AsyncSession = Depends(get_db),
    firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
):
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    # No "invite a teammate" flow exists yet - the only real caller is
    # onboarding adding the founder's own just-created User row as owner.
    # Requiring the caller's own resolved identity to match both the
    # payload's user_id AND this workspace's organisation stops anyone from
    # adding an arbitrary user_id to a workspace they don't belong to.
    user = (await db.execute(select(User).where(User.firebase_uid == firebase_user.uid))).scalar_one_or_none()
    if user is None or user.user_id != payload.user_id or user.organisation_id != workspace.organisation_id:
        raise HTTPException(status_code=403, detail="Not authorized to add this member")

    member = await add_member(db, workspace_id, payload.user_id, payload.role)
    return _member_out(member)


async def list_workspace_members(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    _member: User = Depends(require_workspace_member),
):
    members = await list_members(db, workspace_id)
    return [_member_out(m) for m in members]
