"""Signal Intelligence schemas - backed by BuyingEvent (brief item 15), the
active evidence pipeline. The legacy Signal-table schemas below (SignalOut/
SignalExtractResult/SignalRescoreResult) back only the now-inert /extract
/rescore endpoints - nothing populates CompanyNews/CompanyScoop anymore
(brief item 14) - kept so historical Signal rows stay queryable, not part of
the active feed.
"""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.score import BuyingEventOut


class SignalOut(BuyingEventOut):
    """One BuyingEvent for a company already known from the request path (no
    company_name needed) - GET /signals/{company_id}."""

    company_id: UUID


class SignalWithCompanyOut(BuyingEventOut):
    """One BuyingEvent plus its company name - the active Signal Feed/Detail
    item shape."""

    company_id: UUID
    company_name: str


class SignalListOut(BaseModel):
    items: list[SignalWithCompanyOut]
    total: int
    page: int
    page_size: int


class SignalCategoryCount(BaseModel):
    signal_category: str | None = None
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
    """Signal Intelligence dashboard rollup over BuyingEvent (brief items 15,
    24) - relevance tiers (from xsparks_relevance), not "intent" tiers."""

    total: int
    high_relevance: int
    medium_relevance: int
    low_relevance: int
    company_count: int
    avg_confidence: float | None = None
    executives_impacted: int
    actionable_count: int
    by_category: list[SignalCategoryCount]
    trend: list[SignalTrendPoint]
    # "day" | "week" | "month" - the bucket width trend points are aggregated
    # at. Sent explicitly so the chart can label its axis correctly; the
    # frontend previously guessed ("shown by week" when >28 points), which was
    # wrong whenever the span and the point count disagreed.
    trend_granularity: str = "day"
    top_signals: list[SignalWithCompanyOut]
    histogram: list[ConfidenceBucketCount]
    by_country: list[CountryCount]
    by_source: list[SourceCount]


# --------------------------------------------------------------------------
# Legacy Signal-table result schemas - the /extract /rescore endpoints are now
# inert (brief item 14 removed their only data source) but retained.
# --------------------------------------------------------------------------
class SignalExtractResult(BaseModel):
    inserted: int
    skipped: int


class SignalRescoreResult(BaseModel):
    rescored: int
