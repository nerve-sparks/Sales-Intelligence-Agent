import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Index, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company


class Signal(Base):
    __tablename__ = "signal"
    __table_args__ = (
        UniqueConstraint("original_source", name="signal_original_source_key"),
        Index("idx_signal_company_id", "company_id"),
        Index("idx_signal_signal_type", "signal_type"),
        Index("idx_signal_signal_category", "signal_category"),
    )

    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id"), nullable=False
    )

    source: Mapped[str | None] = mapped_column(Text, server_default="zoominfo")
    original_source: Mapped[str | None] = mapped_column(Text)
    signal_type: Mapped[str] = mapped_column(Text, nullable=False)
    signal_category: Mapped[str] = mapped_column(Text, nullable=False)
    core_fact: Mapped[str | None] = mapped_column(Text)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB)
    dollar_value_usd: Mapped[float | None] = mapped_column(Numeric(15, 2))
    extraction_method: Mapped[str | None] = mapped_column(Text, server_default="rule_based")
    extraction_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    is_action: Mapped[bool | None] = mapped_column(Boolean, server_default="false")
    m2_corroboration: Mapped[float | None] = mapped_column(Numeric(4, 3))
    m3_recency: Mapped[float | None] = mapped_column(Numeric(4, 3))
    m4_resourcing: Mapped[float | None] = mapped_column(Numeric(4, 3))
    signal_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    ingested_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    scored_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    company: Mapped["Company"] = relationship()
