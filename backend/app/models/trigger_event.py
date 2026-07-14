import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.signal import Signal
    from app.models.trigger_definition import TriggerDefinition


class TriggerEvent(Base):
    """One occurrence of a signal matching a trigger definition.

    `notified` is a placeholder for the future LLM/email notification step -
    not written to anywhere yet, just the hook point where that integration
    will mark events as sent.
    """

    __tablename__ = "trigger_event"
    __table_args__ = (
        UniqueConstraint("trigger_id", "signal_id", name="trigger_event_trigger_signal_key"),
        Index("idx_trigger_event_trigger_id", "trigger_id"),
        Index("idx_trigger_event_company_id", "company_id"),
    )

    trigger_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    trigger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trigger_definition.trigger_id", ondelete="CASCADE"), nullable=False
    )
    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("signal.signal_id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id"), nullable=False
    )

    notified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    detected_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    trigger: Mapped["TriggerDefinition"] = relationship()
    signal: Mapped["Signal"] = relationship()
    company: Mapped["Company"] = relationship()
