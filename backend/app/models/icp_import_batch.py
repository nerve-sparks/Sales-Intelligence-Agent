import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, CheckConstraint, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.icp_profile import IcpProfile


class IcpImportBatch(Base):
    """One batch of companies entering the system - the persisted audit record
    behind the Settings prospect-data page and Enterprise List's per-batch
    filter, and the job record the research/scoring task reports progress on.

    Two origins, distinguished by `source`:
      * 'upload'    - a person supplied a spreadsheet. icp_id is NULL.
      * 'generated' - companies discovered from an ICP (see lead_generation.py).
                      icp_id names that ICP.

    Both then follow the identical path: company rows, background research,
    evidence scoring, job polling, retry/cancel and export all work the same
    way, which is why generation reuses this table rather than adding its own.

    The table keeps its historical name from when uploads were ICP-scoped.
    Batches are scoped to a workspace (workspace_id); the
    active_count/nurture_count/matched_icp_count columns are legacy-read-only,
    and new classification uses the sales-status counts below.
    """

    __tablename__ = "icp_import_batch"
    __table_args__ = (
        CheckConstraint("source IN ('upload', 'generated')", name="icp_import_batch_source_check"),
        Index("idx_icp_import_batch_icp_id", "icp_id"),
        Index("idx_icp_import_batch_workspace_id", "workspace_id"),
    )

    import_batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.workspace_id", ondelete="CASCADE")
    )
    # NULL for a file upload. Set for a generated batch, naming the ICP the
    # companies were discovered from (SET NULL, so deleting that ICP later
    # leaves the batch and its companies intact).
    icp_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("icp_profile.icp_id", ondelete="SET NULL")
    )

    # How this batch's companies came to exist: 'upload' (a person supplied a
    # file) or 'generated' (discovered from an ICP). Generated companies arrive
    # with no contacts, so their Contact Access is 0 and their Lead Score is
    # capped lower than an uploaded company's - the label is what stops that
    # structural difference reading as "worse prospects".
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="upload")

    file_names: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    files_processed: Mapped[int] = mapped_column(Integer, nullable=False)
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    companies_ingested: Mapped[int] = mapped_column(Integer, nullable=False)
    signals_extracted: Mapped[int] = mapped_column(Integer, nullable=False)
    # Legacy read-only counters (old ICP/gate pipeline).
    matched_icp_count: Mapped[int] = mapped_column(Integer, nullable=False)
    active_count: Mapped[int] = mapped_column(Integer, nullable=False)
    nurture_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # New pipeline sales-status classification counts.
    sales_ready_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    high_priority_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    warm_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    monitor_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    low_priority_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    # 'pending' while the background scoring pass is still running (see
    # excel_pipeline.py) - counts are 0 until it flips to 'complete', so the
    # UI can tell "still scoring" apart from "genuinely zero results".
    scoring_status: Mapped[str] = mapped_column(Text, server_default="complete", nullable=False)

    # Operational status of the background research+scoring task (brief item 21).
    # research_status: pending | complete | complete_with_warnings | failed - so
    # a batch is never left permanently 'pending' when the task raises.
    research_status: Mapped[str] = mapped_column(Text, server_default="pending", nullable=False)
    companies_researched: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    research_failure_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    llm_failure_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    scoring_failure_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    processing_started_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    processing_completed_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    processing_error: Mapped[str | None] = mapped_column(Text)
    processing_warnings: Mapped[list | dict | None] = mapped_column(JSONB)

    # Cooperative cancellation (POST .../imports/{id}/cancel): set when a user
    # cancels a running batch. The background task polls this between
    # companies and stops picking up new work once it's set, rather than
    # being killed mid-write - already-completed companies keep their result.
    cancel_requested_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    icp: Mapped["IcpProfile"] = relationship()
