import uuid

from sqlalchemy import TIMESTAMP, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TriggerDefinition(Base):
    __tablename__ = "trigger_definition"

    trigger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
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
