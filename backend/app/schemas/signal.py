from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    signal_id: UUID
    company_id: UUID
    source: str | None = None
    original_source: str | None = None
    signal_type: str
    signal_category: str
    core_fact: str | None = None
    dollar_value_usd: float | None = None
    extraction_method: str | None = None
    extraction_confidence: float | None = None
    is_action: bool | None = None
    m2_corroboration: float | None = None
    m3_recency: float | None = None
    m4_resourcing: float | None = None
    signal_confidence: float | None = None
    ingested_at: datetime | None = None
    scored_at: datetime | None = None


class SignalExtractResult(BaseModel):
    inserted: int
    skipped: int


class SignalRescoreResult(BaseModel):
    rescored: int
