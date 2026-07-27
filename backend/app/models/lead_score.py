import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, CheckConstraint, ForeignKey, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.company import Company


class LeadScore(Base):
    __tablename__ = "lead_score"
    __table_args__ = (
        CheckConstraint(
            "gate_status IN ('active', 'nurture')",
            name="lead_score_gate_status_check",
        ),
        UniqueConstraint("company_id", name="lead_score_company_id_key"),
    )

    lead_score_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.company_id"), nullable=False
    )

    gate_check_1: Mapped[bool | None] = mapped_column(Boolean)
    gate_check_2: Mapped[bool | None] = mapped_column(Boolean)
    gate_check_3: Mapped[bool | None] = mapped_column(Boolean)
    gate_check_4: Mapped[bool | None] = mapped_column(Boolean)
    gate_check_5: Mapped[bool | None] = mapped_column(Boolean)
    gate_passed: Mapped[bool | None] = mapped_column(Boolean)
    gate_status: Mapped[str | None] = mapped_column(Text)

    d1_pain_acuity: Mapped[float | None] = mapped_column(Numeric(5, 2))
    d2_ai_intent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    d3_economic_capacity: Mapped[float | None] = mapped_column(Numeric(5, 2))
    d4_authority: Mapped[float | None] = mapped_column(Numeric(5, 2))
    d5_timing_catalyst: Mapped[float | None] = mapped_column(Numeric(5, 2))
    d6_solution_fit: Mapped[float | None] = mapped_column(Numeric(5, 2))
    d7_competitive: Mapped[float | None] = mapped_column(Numeric(5, 2))
    component_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    p_convert: Mapped[float | None] = mapped_column(Numeric(4, 3))
    expected_deal_value_usd: Mapped[float | None] = mapped_column(Numeric(15, 2))
    lead_score: Mapped[float | None] = mapped_column(Numeric(15, 2))

    # Legacy gate/D1-D7 columns (old ICP-based scoring engine, removed - see
    # evidence_scorer.py, which explicitly leaves these NULL on every score).
    # Kept only so historical rows scored before the evidence-based rewrite
    # stay readable; nothing in the active pipeline writes to them anymore.
    d1_reasoning: Mapped[str | None] = mapped_column(Text)
    d2_reasoning: Mapped[str | None] = mapped_column(Text)
    d5_reasoning: Mapped[str | None] = mapped_column(Text)
    recency_factor: Mapped[float | None] = mapped_column(Numeric(4, 3))
    p_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    deal_tier: Mapped[float | None] = mapped_column(Numeric(5, 2))

    # Current evidence-based pipeline. Legacy gate/D1-D7 columns above are
    # retained only so historical rows remain readable.
    buying_evidence_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    contact_access_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    negative_event_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    evidence_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    confidence_label: Mapped[str | None] = mapped_column(Text)
    sales_status: Mapped[str | None] = mapped_column(Text)
    expected_deal_min_usd: Mapped[float | None] = mapped_column(Numeric(15, 2))
    expected_deal_max_usd: Mapped[float | None] = mapped_column(Numeric(15, 2))
    expected_revenue_usd: Mapped[float | None] = mapped_column(Numeric(15, 2))
    best_offering: Mapped[str | None] = mapped_column(Text)
    why_now: Mapped[str | None] = mapped_column(Text)
    recommended_action: Mapped[str | None] = mapped_column(Text)
    # Concise presentation-only evidence; the full evidence lives in
    # buying_event (brief section 20).
    evidence_summary: Mapped[list | dict | None] = mapped_column(JSONB)

    # Expected Deal Value provenance (separate from Lead Score - brief 19/20).
    deal_value_basis: Mapped[str | None] = mapped_column(Text)
    deal_value_confidence: Mapped[str | None] = mapped_column(Text)
    # Commercial-viability flag only - never gates scoring or display.
    commercially_viable: Mapped[bool | None] = mapped_column(Boolean)
    score_version: Mapped[int | None] = mapped_column(Numeric(6, 0))
    score_formula_version: Mapped[str | None] = mapped_column(Text)
    scoring_warnings: Mapped[list | dict | None] = mapped_column(JSONB)

    scored_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    company: Mapped["Company"] = relationship()
