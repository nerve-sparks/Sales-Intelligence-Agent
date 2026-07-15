import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.organisation import Organisation
    from app.models.workspace_member import WorkspaceMember


class Workspace(Base):
    """A shared, department-level context within an Organisation (e.g. Sales,
    Marketing, Operations). Owns ICPs and Triggers; Users gain access via
    WorkspaceMember, not by owning the workspace itself.
    """

    __tablename__ = "workspace"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation.organisation_id", ondelete="CASCADE"), nullable=False
    )

    workspace_name: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    organisation: Mapped["Organisation"] = relationship(back_populates="workspaces")
    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )
