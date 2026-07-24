import uuid
from typing import TYPE_CHECKING

from sqlalchemy import TIMESTAMP, Boolean, CheckConstraint, ForeignKey, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
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

    # Enhanced-engine outputs (lead_scorer): Gemini reasoning strings for the
    # three LLM-judged dimensions, the math recency factor behind D5, the
    # readiness sub-score, and the fixed deal tier feeding the final blend.
    d1_reasoning: Mapped[str | None] = mapped_column(Text)
    d2_reasoning: Mapped[str | None] = mapped_column(Text)
    d5_reasoning: Mapped[str | None] = mapped_column(Text)
    recency_factor: Mapped[float | None] = mapped_column(Numeric(4, 3))
    p_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    deal_tier: Mapped[float | None] = mapped_column(Numeric(5, 2))

    scored_at: Mapped[object | None] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("now()")
    )

    company: Mapped["Company"] = relationship()
