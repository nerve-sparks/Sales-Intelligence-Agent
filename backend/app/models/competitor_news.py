import uuid

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CompetitorNews(Base):
    """News about the tenant's competitors themselves (not prospects) - what
    competitor_news_service collects for the dashboard's Competitor News tab.

    Organisation-scoped, one row per article URL. Kept to the last
    NEWS_RETENTION_DAYS: older rows are deleted on every refresh, unlike
    BuyingEvent, which is scoring evidence and never deleted."""

    __tablename__ = "competitor_news"
    __table_args__ = (
        UniqueConstraint("organisation_id", "url", name="competitor_news_org_url_key"),
        Index("ix_competitor_news_org_discovered", "organisation_id", "discovered_at"),
    )

    competitor_news_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisation.organisation_id", ondelete="CASCADE"), nullable=False
    )
    competitor_name: Mapped[str] = mapped_column(Text, nullable=False)
    competitor_domain: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    why_it_matters: Mapped[str | None] = mapped_column(Text)
    # funding | launch | partnership | customer_win | hiring | leadership | other
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    url: Mapped[str] = mapped_column(Text, nullable=False)
    source_domain: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    discovered_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
