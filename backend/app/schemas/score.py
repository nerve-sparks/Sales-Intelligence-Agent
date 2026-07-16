from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class LeadScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lead_score_id: UUID
    company_id: UUID
    gate_check_1: bool | None = None
    gate_check_2: bool | None = None
    gate_check_3: bool | None = None
    gate_check_4: bool | None = None
    gate_check_5: bool | None = None
    gate_passed: bool | None = None
    gate_status: str | None = None
    d1_pain_acuity: float | None = None
    d2_ai_intent: float | None = None
    d3_economic_capacity: float | None = None
    d4_authority: float | None = None
    d5_timing_catalyst: float | None = None
    d6_solution_fit: float | None = None
    d7_competitive: float | None = None
    component_score: float | None = None
    p_convert: float | None = None
    expected_deal_value_usd: float | None = None
    lead_score: float | None = None
    scored_at: datetime | None = None


class RankedLeadScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_name: str
    lead_score: float | None = None
    component_score: float | None = None
    gate_status: str | None = None


class NotScoredOut(BaseModel):
    detail: str


class ScoreRunResult(BaseModel):
    active: int
    nurture: int
