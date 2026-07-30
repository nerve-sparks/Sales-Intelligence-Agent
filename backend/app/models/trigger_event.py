import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.buying_event import BuyingEvent
    from app.models.company import Company
    from app.models.trigger_definition import TriggerDefinition


class TriggerEvent(Base):
    """One occurrence of a BuyingEvent matching a trigger definition.

    Points at buying_event, NOT the legacy signal table: nothing populates
    signal anymore (the evidence pipeline writes buying_event), so matching
    against it meant every trigger silently found zero recent events. See
    trigger_matcher.detect_trigger_events.

    `notified` is a placeholder for a future email/push step - the in-app
    "new since last seen" count is computed from detected_at vs
    TriggerDefinition.last_seen_at instead, so nothing depends on this flag
    being written yet.
    """

    __tablename__ = "trigger_event"
    __table_args__ = (
        UniqueConstraint("trigger_id", "buying_event_id", name="trigger_event_trigger_buying_event_key"),
        Index("idx_trigger_event_trigger_id", "trigger_id"),
        Index("idx_trigger_event_company_id", "company_id"),
    )

    trigger_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    trigger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trigger_definition.trigger_id", ondelete="CASCADE"), nullable=False
    )
    buying_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("buying_event.buying_event_id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    notified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    detected_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    trigger: Mapped["TriggerDefinition"] = relationship()
    buying_event: Mapped["BuyingEvent"] = relationship()
    company: Mapped["Company"] = relationship()
