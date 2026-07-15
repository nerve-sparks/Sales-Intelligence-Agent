import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text, text
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

    # Match a signal.signal_type OR a signal.signal_category (see SIGNAL_CATEGORY_MAP
    # in services/signal_extractor.py for existing values, e.g. "ceo_change" is a
    # signal_type, "buying_stage" is a signal_category)
    signal_types: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    signal_categories: Mapped[list[str] | None] = mapped_column(ARRAY(Text))

    created_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    workspace: Mapped["Workspace"] = relationship()
