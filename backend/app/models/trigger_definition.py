import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.workspace import Workspace


class TriggerDefinition(Base):
    __tablename__ = "trigger_definition"
    __table_args__ = (
        Index("idx_trigger_definition_workspace_id", "workspace_id"),
    )

    trigger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.workspace_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(Text)

    # Matches BuyingEvent.category - the SAME six category values the scoring
    # pipeline itself uses (see core/scoring_config.py and the event_category
    # list in buying_event_service._build_prompt), never a parallel
    # vocabulary. The previous signal_types column matched
    # signal_extractor.py's old SIGNAL_CATEGORY_MAP types (rfp_published,
    # ceo_change, ...), which the evidence pipeline does not produce at all -
    # those triggers silently matched zero events, so that column is gone
    # rather than left as a trap.
    signal_categories: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    # Minimum BuyingEvent.event_score a matching event must reach - the real
    # scored strength (base_strength x relevance x freshness x source_quality
    # x extraction_confidence x status_factor, see
    # buying_event_service.compute_event_score), not a separate notion of
    # importance. This is what keeps a trigger precise instead of firing on
    # every weak mention in its category.
    min_event_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, server_default="0")

    # Alerting watermark: matches whose trigger_event.detected_at is newer
    # than this count as "new since you last looked" (see
    # trigger_matcher.detect_trigger_events / mark_trigger_seen). NULL means
    # never viewed, so every match is new.
    last_seen_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    workspace: Mapped["Workspace"] = relationship()
