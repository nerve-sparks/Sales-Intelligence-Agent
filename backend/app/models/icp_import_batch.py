import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.icp_profile import IcpProfile


class IcpImportBatch(Base):
    """One Excel upload event against an ICP - the persisted audit record
    for the Settings > ICP Data page (as opposed to LeadScore/Signal/Company,
    which store the *result* of uploads, not that an upload happened)."""

    __tablename__ = "icp_import_batch"
    __table_args__ = (
        Index("idx_icp_import_batch_icp_id", "icp_id"),
    )

    import_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    icp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("icp_profile.icp_id", ondelete="CASCADE"), nullable=False
    )

    file_names: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    files_processed: Mapped[int] = mapped_column(Integer, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    companies_ingested: Mapped[int] = mapped_column(Integer, nullable=False)
    signals_extracted: Mapped[int] = mapped_column(Integer, nullable=False)
    matched_icp_count: Mapped[int] = mapped_column(Integer, nullable=False)
    active_count: Mapped[int] = mapped_column(Integer, nullable=False)
    nurture_count: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    icp: Mapped["IcpProfile"] = relationship()
