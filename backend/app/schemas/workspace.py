from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    organisation_id: UUID
    workspace_name: str
    purpose: str | None = None
    created_at: datetime | None = None


class MemberOut(BaseModel):
    workspace_member_id: UUID
    workspace_id: UUID
    user_id: UUID
    email: str | None = None
    full_name: str | None = None
    designation: str | None = None
    role: str
    created_at: datetime | None = None
