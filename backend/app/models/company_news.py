import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company


class CompanyNews(Base):
    __tablename__ = "company_news"
    __table_args__ = (
        Index("idx_news_company_id", "company_id"),
        Index("idx_news_category", "category"),
        Index("idx_news_page_date", text("page_date DESC")),
    )

    # Identity
    news_id: Mapped[str] = mapped_column(Text, primary_key=True)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Article Data
    domain: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    page_date: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Relationships
    company: Mapped["Company"] = relationship(back_populates="news")
