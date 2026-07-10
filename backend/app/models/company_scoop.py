import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company


class CompanyScoop(Base):
    __tablename__ = "company_scoop"
    __table_args__ = (
        Index("idx_scoop_company_id", "company_id"),
        Index("idx_scoop_published_date", text("published_date DESC")),
    )

    # Identity
    scoop_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Scoop Data
    description: Mapped[str | None] = mapped_column(Text)
    published_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Topic & Type
    topics: Mapped[dict | None] = mapped_column(JSONB)  # [{id, topic}]
    types: Mapped[dict | None] = mapped_column(JSONB)  # [{id, type}]

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="scoops")
