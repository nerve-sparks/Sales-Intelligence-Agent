import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.workspace import Workspace


class WorkspaceMember(Base):
    """Join table: which Users belong to which Workspace, with what role.

    A user can belong to multiple workspaces (Sales AND Marketing, etc.) -
    this is what makes ICPs/Triggers shared within a workspace instead of
    owned by a single user.
    """

    __tablename__ = "workspace_member"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="workspace_member_workspace_user_key"),
    )

    workspace_member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.workspace_id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.user_id", ondelete="CASCADE"), nullable=False
    )

    role: Mapped[str] = mapped_column(Text, nullable=False, server_default="member")

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="workspace_memberships")
