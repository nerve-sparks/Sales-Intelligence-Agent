import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.organisation import Organisation
    from app.models.workspace_member import WorkspaceMember


class User(Base):
    __tablename__ = "app_user"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation.organisation_id", ondelete="CASCADE"), nullable=False
    )

    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(Text)
    designation: Mapped[str | None] = mapped_column(Text)

    # Firebase Auth uid this row was created under (see app/core/auth.py) -
    # nullable because rows created before this column existed have none.
    firebase_uid: Mapped[str | None] = mapped_column(Text, unique=True)

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    organisation: Mapped["Organisation"] = relationship(back_populates="users")
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship(back_populates="user")
