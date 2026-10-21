import uuid

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UploadQuotaEvent(Base):
    """One row per Excel/CSV file a user uploaded - the ledger behind the
    per-account upload limit (upload_quota service).

    Deliberately separate from icp_import_batch: deleting an upload removes
    its batch, but must NOT hand the slot back (the research spend already
    happened), so these rows are never deleted with the upload."""

    __tablename__ = "upload_quota_event"
    __table_args__ = (Index("ix_upload_quota_event_user_created", "user_id", "created_at"),)

    upload_quota_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.user_id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.workspace_id", ondelete="SET NULL")
    )
    file_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
