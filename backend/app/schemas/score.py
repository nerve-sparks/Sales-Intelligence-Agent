from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BuyingEventOut(BaseModel):
    """One canonical buying event with its scoring factors and evidence
    sources (brief section 21). Evidence carries the source URLs that back
    every claim."""

    model_config = ConfigDict(from_attributes=True)

    buying_event_id: UUID
    event_type: str
    category: str | None = None
    title: str | None = None
    summary: str | None = None
    published_at: datetime | None = None
    # When research FOUND this event, as opposed to when the event happened.
    # Always populated (buying_event.created_at has no nulls across 9,171 rows),
    # so every signal can show a real date even when published_at is unknown -
    # 1,836 events have no publish date because it could not be sourced.
    #
    # Deliberately a SEPARATE field, never copied into published_at: freshness
    # is computed from published_at, so stamping the research date there would
    # award freshness 1.0 to events of unknown age. That is precisely the bug
    # that scored Premier Coil Solutions 100/100 off six undated static pages.
    discovered_at: datetime | None = None
    base_strength: float | None = None
    relevance: float | None = None
    freshness: float | None = None
    source_quality: float | None = None
    extraction_confidence: float | None = None
    status_factor: float | None = None
    event_score: float | None = None
    is_negative: bool = False
    penalty_value: float | None = None
    best_offering: str | None = None
    reasoning: str | None = None
    # Explicit public AI/procurement budget tied to this event (brief item 18).
    public_budget_usd: float | None = None
    budget_currency: str | None = None
    budget_confidence: str | None = None
    evidence: list | dict | None = None


class LeadScoreOut(BaseModel):
    """Evidence-based score for one company (brief section 21). No gate/D1-D7
    fields - those are gone from the active product."""

    model_config = ConfigDict(from_attributes=True)

    lead_score_id: UUID
    company_id: UUID
    lead_score: float | None = None
    sales_status: str | None = None
    buying_evidence_score: float | None = None
    contact_access_score: float | None = None
    negative_event_score: float | None = None
    evidence_confidence: float | None = None
    confidence_label: str | None = None
    best_offering: str | None = None
    why_now: str | None = None
    recommended_action: str | None = None
    expected_deal_min_usd: float | None = None
    expected_deal_max_usd: float | None = None
    expected_deal_value_usd: float | None = None
    expected_revenue_usd: float | None = None
    deal_value_basis: str | None = None
    deal_value_confidence: str | None = None
    commercially_viable: bool | None = None
    evidence_summary: list | dict | None = None
    scoring_warnings: list | dict | None = None
    scored_at: datetime | None = None


class ScoreDetailOut(LeadScoreOut):
    """Full company score plus its underlying canonical events (brief 21)."""

    events: list[BuyingEventOut] = []


class RankedLeadScoreOut(BaseModel):
    """One row of the ranked list - every scored company, not just gated ones
    (brief section 22)."""

    company_id: UUID
    company_name: str
    lead_score: float | None = None
    sales_status: str | None = None
    confidence_label: str | None = None
    buying_evidence_score: float | None = None
    contact_access_score: float | None = None
    negative_event_score: float | None = None
    best_offering: str | None = None
    why_now: str | None = None
    expected_deal_min_usd: float | None = None
    expected_deal_max_usd: float | None = None
    expected_deal_value_usd: float | None = None
    scored_at: datetime | None = None
    # Strongest reachable DecisionMaker - powers Dashboard "Contact Now" / mail.
    primary_contact_email: str | None = None
    primary_contact_name: str | None = None


class NotScoredOut(BaseModel):
    detail: str


class ScoreRunResult(BaseModel):
    """Per-sales-status counts from a scoring run (brief section 17)."""

    sales_ready: int = 0
    high_priority: int = 0
    warm: int = 0
    monitor: int = 0
    low_priority: int = 0
