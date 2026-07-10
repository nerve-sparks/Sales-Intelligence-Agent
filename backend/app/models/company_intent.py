import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Index, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company


class CompanyIntent(Base):
    __tablename__ = "company_intent"
    __table_args__ = (
        Index("idx_intent_company_id", "company_id"),
        Index("idx_intent_topic", "topic"),
        Index("idx_intent_signal_score", text("signal_score DESC")),
        Index("idx_intent_signal_date", "signal_date"),
    )

    # ZoomInfo Identity
    intent_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Intent Data
    category: Mapped[str | None] = mapped_column(Text)
    topic: Mapped[str | None] = mapped_column(Text)
    signal_score: Mapped[int | None] = mapped_column(SmallInteger)
    signal_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Recommended Contacts
    # [{id, firstName, lastName, jobTitle, jobFunctions: [{name, department}]}]
    recommended_contacts: Mapped[dict | None] = mapped_column(JSONB)

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="intents")
