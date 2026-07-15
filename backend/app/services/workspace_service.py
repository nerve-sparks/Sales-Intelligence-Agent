from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Workspace, WorkspaceMember


async def create_workspace(session: AsyncSession, organisation_id: UUID, values: dict) -> Workspace:
    workspace = Workspace(organisation_id=organisation_id, **values)
    session.add(workspace)
    await session.commit()
    await session.refresh(workspace)
    return workspace


async def get_workspace(session: AsyncSession, organisation_id: UUID, workspace_id: UUID) -> Workspace | None:
    stmt = select(Workspace).where(
        Workspace.workspace_id == workspace_id, Workspace.organisation_id == organisation_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_workspaces(session: AsyncSession, organisation_id: UUID) -> list[Workspace]:
    stmt = select(Workspace).where(Workspace.organisation_id == organisation_id)
    return (await session.execute(stmt)).scalars().all()


async def add_member(session: AsyncSession, workspace_id: UUID, user_id: UUID, role: str) -> WorkspaceMember:
    member = WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=role)
    session.add(member)
    await session.commit()

    stmt = (
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_member_id == member.workspace_member_id)
        .options(selectinload(WorkspaceMember.user))
    )
    return (await session.execute(stmt)).scalar_one()


async def list_members(session: AsyncSession, workspace_id: UUID) -> list[WorkspaceMember]:
    stmt = (
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .options(selectinload(WorkspaceMember.user))
    )
    return (await session.execute(stmt)).scalars().all()
