import uuid

from sqlalchemy import TIMESTAMP, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AiMarketCompany(Base):
    """One of the top global AI companies the dashboard news follows. The whole
    list is rebuilt by ai_market_news_service (you.com search -> LLM) on each
    scheduled run, and kept as-is when that rebuild fails. Global: the same
    list for every organisation."""

    __tablename__ = "ai_market_company"

    ai_market_company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class AiMarketNews(Base):
    """A news item about one of the top AI companies - the dashboard's Latest
    News card. Global (not per organisation), one row per article URL, and
    kept to the last NEWS_RETENTION_DAYS."""

    __tablename__ = "ai_market_news"
    __table_args__ = (Index("ix_ai_market_news_discovered", "discovered_at"),)

    ai_market_news_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    company_name: Mapped[str] = mapped_column(Text, nullable=False)
    company_domain: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    # product_launch | funding | press_briefing | buying_signal
    category: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    source_domain: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))
    discovered_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class ScheduledJobRun(Base):
    """Last run of a global scheduled job (news_scheduler) - also the atomic
    claim that stops a restart or a second instance from running it twice."""

    __tablename__ = "scheduled_job_run"

    job_key: Mapped[str] = mapped_column(Text, primary_key=True)
    last_run_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
