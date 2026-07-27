import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, CheckConstraint, ForeignKey, Index, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.icp_import_batch import IcpImportBatch

# Per-company processing stages, in pipeline order. Mirrors what this
# app's background pipeline actually does (excel_pipeline.py +
# search_signal_ingest.py + evidence_scorer.py) - no decision-maker lookup or
# email generation stage, since neither exists in this product.
COMPANY_BATCH_STATUS_VALUES = (
    "queued", "researching", "scoring", "completed", "retrying", "failed", "needs_review",
)


class CompanyImportBatch(Base):
    """Permanent many-to-many membership between a company and every prospect
    upload it appeared in (brief item 5). The authoritative import-history
    relationship - replaces the single Company.import_batch_id column, which
    a later re-upload would overwrite and thereby erase earlier membership.

    A company appearing in three uploads has three rows here; filtering,
    scoring scope, dashboard rollups, exports, and ranked/signal filtering all
    resolve "which companies belong to batch X" through this table, so history
    is never destroyed by a subsequent upload.

    Also doubles as the per-company processing-status row for ITS batch (added
    for per-company job tracking): status/error_message/retry_count let
    GET .../imports/{id}/items show exactly where each company is, and
    POST .../retry-failed re-queue only the ones that actually failed,
    without needing a separate table - the unique (company_id, import_batch_id)
    row already uniquely identifies "this company, in this run".
    """

    __tablename__ = "company_import_batch"
    __table_args__ = (
        UniqueConstraint("company_id", "import_batch_id", name="company_import_batch_unique"),
        CheckConstraint(
            "status IN ('queued', 'researching', 'scoring', 'completed', 'retrying', 'failed', 'needs_review')",
            name="company_import_batch_status_check",
        ),
        Index("idx_company_import_batch_company", "company_id"),
        Index("idx_company_import_batch_batch", "import_batch_id"),
        Index("idx_company_import_batch_status", "import_batch_id", "status"),
    )

    company_import_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )
    import_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("icp_import_batch.import_batch_id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))

    # Per-company processing status within this batch (see class docstring).
    status: Mapped[str] = mapped_column(Text, server_default="queued", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    # True for a failure that re-running would never fix (e.g. no domain to
    # research) - retry-failed skips these; only transient failures qualify.
    is_permanent_failure: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    started_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    completed_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    company: Mapped["Company"] = relationship()
    batch: Mapped["IcpImportBatch"] = relationship()
