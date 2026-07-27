from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DecisionMakerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    decision_maker_id: UUID
    company_id: UUID
    zi_person_id: int
    first_name: str | None = None
    last_name: str | None = None
    picture_url: str | None = None
    job_title: str | None = None
    department: str | None = None
    years_of_experience: str | None = None
    persona: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile_phone: str | None = None
    linkedin_url: str | None = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_id: UUID
    zi_company_id: int
    company_name: str
    company_domain: str | None = None
    company_type: str | None = None
    company_status: str | None = None
    is_verified: bool | None = None
    employee_count: int | None = None
    employee_range: str | None = None
    revenue_usd: int | None = None
    revenue_range: str | None = None
    ownership_type: str | None = None
    founded_year: str | None = None
    description: str | None = None
    logo_url: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    continent: str | None = None
    primary_industry: list[str] | None = None
    industries: list[str] | None = None
    linkedin_url: str | None = None
    twitter_url: str | None = None
    facebook_url: str | None = None
    total_funding_amount: int | None = None
    recent_funding_amount: int | None = None
    recent_funding_date: datetime | None = None
    company_funding: list | dict | None = None
    employee_growth: list | dict | None = None
    competitors: list | dict | None = None
    technologies: list[str] | None = None
    products: list[str] | None = None


class CompanyWithDecisionMakersOut(CompanyOut):
    """Company shape used where `decision_makers` was eagerly loaded (e.g.
    company_directory.get_company's selectinload) - kept separate from
    CompanyOut so a response backed by that eager load never triggers an
    unloaded-relationship lazy load.
    """

    decision_makers: list[DecisionMakerOut] = []


class CompanyListItemOut(BaseModel):
    company_id: UUID
    company_name: str
    company_domain: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    employee_count: int | None = None
    employee_range: str | None = None
    revenue_usd: int | None = None
    revenue_range: str | None = None
    industries: list[str] | None = None
    logo_url: str | None = None
    # Evidence-based score fields (brief section 23). No gate_status.
    lead_score: float | None = None
    sales_status: str | None = None
    confidence_label: str | None = None
    buying_evidence_score: float | None = None
    contact_access_score: float | None = None
    negative_event_score: float | None = None
    best_offering: str | None = None
    why_now: str | None = None
    expected_deal_value_usd: float | None = None


class CompanyListOut(BaseModel):
    items: list[CompanyListItemOut]
    total: int
    page: int
    page_size: int


class CountryLeadScoreOut(BaseModel):
    country: str
    avg_lead_score: float
    company_count: int


class CompanyStatsOut(BaseModel):
    """Evidence-based company stats (brief item 22) - sales-status bands, not
    high/medium/low intent tiers."""

    total: int
    scored: int = 0
    unscored: int = 0
    sales_ready: int = 0
    high_priority: int = 0
    warm: int = 0
    monitor: int = 0
    low_priority: int = 0
    high_confidence: int = 0
    provisional_pipeline_value: float = 0.0
    by_country: list[CountryLeadScoreOut] = []


class CompanyInsightOut(BaseModel):
    summary: str
