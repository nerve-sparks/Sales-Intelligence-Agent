import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Index,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company


class BuyingEvent(Base):
    """One real-world buying-relevant event for a company - the canonical
    dedup layer (brief section 11). Multiple articles about the *same* event
    (company announcement + PR wire pickup + industry report) collapse into
    ONE BuyingEvent with multiple evidence sources, never three scored
    signals. The (company_id, canonical_key) unique constraint enforces this:
    corroborating sources are appended to `evidence` and can raise confidence,
    but never add another full event score.

    Replaces the Signal table's role in the active pipeline. event_score is the
    deterministic product of the multipliers (brief section 12), computed and
    stored here so scoring never re-derives it.
    """

    __tablename__ = "buying_event"
    __table_args__ = (
        UniqueConstraint("company_id", "canonical_key", name="buying_event_company_canonical_key"),
        Index("idx_buying_event_company_id", "company_id"),
    )

    buying_event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id", ondelete="CASCADE"), nullable=False
    )

    # Dedup identity - hash of (company, event_type, normalised subject/action/
    # object, event month). Same real event -> same key -> one row.
    canonical_key: Mapped[str] = mapped_column(Text, nullable=False)

    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)

    # List of corroborating sources: [{url, domain, title, snippet,
    # published_date, search_query, retrieved_at, source_type, position}, ...].
    evidence: Mapped[list | dict | None] = mapped_column(JSONB)

    published_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True))

    # Scoring multipliers (all 0-1 except base_strength which is 0-100), stored
    # so the deterministic event_score is reproducible and auditable.
    base_strength: Mapped[float | None] = mapped_column(Numeric(5, 2))
    relevance: Mapped[float | None] = mapped_column(Numeric(4, 3))
    freshness: Mapped[float | None] = mapped_column(Numeric(4, 3))
    source_quality: Mapped[float | None] = mapped_column(Numeric(4, 3))
    extraction_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    status_factor: Mapped[float | None] = mapped_column(Numeric(4, 3))
    event_score: Mapped[float | None] = mapped_column(Numeric(6, 2))

    is_negative: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    penalty_value: Mapped[float | None] = mapped_column(Numeric(6, 2))

    best_offering: Mapped[str | None] = mapped_column(Text)
    reasoning: Mapped[str | None] = mapped_column(Text)

    # Explicit public AI/procurement budget tied to THIS event (brief item 18),
    # used by Expected Deal Value. Only set when the LLM extracts a budget the
    # source explicitly ties to the relevant programme - never an unrelated
    # funding/valuation/contract figure.
    public_budget_usd: Mapped[float | None] = mapped_column(Numeric(15, 2))
    budget_currency: Mapped[str | None] = mapped_column(Text)
    budget_source_url: Mapped[str | None] = mapped_column(Text)
    budget_confidence: Mapped[str | None] = mapped_column(Text)

    # Staleness tracking across research runs (brief item 10). An event not
    # rediscovered in later runs is marked stale so it stops carrying buying
    # influence, while its evidence history is preserved.
    first_seen_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    last_seen_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    research_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_stale: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)

    created_at: Mapped[object | None] = mapped_column(TIMESTAMP(timezone=True), server_default=text("now()"))
    updated_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()"), onupdate=text("now()")
    )

    company: Mapped["Company"] = relationship()
