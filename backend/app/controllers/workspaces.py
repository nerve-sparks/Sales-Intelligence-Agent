from uuid import UUID

from fastapi import Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.workspace_service import add_member, create_workspace, list_members, list_workspaces
from app.views.workspace_view import serialize_member, serialize_workspace


class WorkspaceCreate(BaseModel):
    workspace_name: str
    purpose: str | None = None


class MemberCreate(BaseModel):
    user_id: UUID
    role: str = "member"


async def create(organisation_id: UUID, payload: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    workspace = await create_workspace(db, organisation_id, payload.model_dump())
    return serialize_workspace(workspace)


async def list_all(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    workspaces = await list_workspaces(db, organisation_id)
    return [serialize_workspace(w) for w in workspaces]


async def add_workspace_member(workspace_id: UUID, payload: MemberCreate, db: AsyncSession = Depends(get_db)):
    member = await add_member(db, workspace_id, payload.user_id, payload.role)
    return serialize_member(member)


async def list_workspace_members(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    members = await list_members(db, workspace_id)
    return [serialize_member(m) for m in members]
