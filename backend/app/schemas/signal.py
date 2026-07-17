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


class SignalWithCompanyOut(BaseModel):
    signal_id: UUID
    company_id: UUID
    company_name: str
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


class SignalListOut(BaseModel):
    items: list[SignalWithCompanyOut]
    total: int
    page: int
    page_size: int


class SignalCategoryCount(BaseModel):
    signal_category: str
    count: int
    company_count: int
    avg_confidence: float | None = None


class SignalTrendPoint(BaseModel):
    date: str
    total: int
    high: int
    medium: int
    low: int


class ConfidenceBucketCount(BaseModel):
    bucket: str
    count: int


class CountryCount(BaseModel):
    country: str
    count: int


class SourceCount(BaseModel):
    source: str
    count: int


class SignalStatsOut(BaseModel):
    total: int
    high_intent: int
    medium_intent: int
    low_intent: int
    company_count: int
    avg_confidence: float | None = None
    executives_impacted: int
    actionable_count: int
    by_category: list[SignalCategoryCount]
    trend: list[SignalTrendPoint]
    top_signals: list[SignalWithCompanyOut]
    histogram: list[ConfidenceBucketCount]
    by_country: list[CountryCount]
    by_source: list[SourceCount]


class SignalExtractResult(BaseModel):
    inserted: int
    skipped: int


class SignalRescoreResult(BaseModel):
    rescored: int
