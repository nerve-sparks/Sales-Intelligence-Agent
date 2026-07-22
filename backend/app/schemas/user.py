from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    organisation_id: UUID
    email: str
    full_name: str | None = None
    designation: str | None = None
    created_at: datetime | None = None
