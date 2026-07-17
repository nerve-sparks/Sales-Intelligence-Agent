from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DecisionMakerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    decision_maker_id: UUID
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
    """Company shape used where `decision_makers` was eagerly loaded
    (e.g. selectinload in icp_filter.filter_companies). Kept separate from
    CompanyOut so responses backed by a freshly-upserted Company (Enrich
    endpoints) never trigger an unloaded-relationship lazy load.
    """

    decision_makers: list[DecisionMakerOut] = []


class IntentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    intent_id: str
    company_id: UUID
    category: str | None = None
    topic: str | None = None
    signal_score: int | None = None
    signal_date: datetime | None = None
    recommended_contacts: list | dict | None = None


class ScoopOut(BaseModel):
    scoop_id: str
    company_id: UUID
    description: str | None = None
    published_date: datetime | None = None
    topics: list | dict | None = None
    types: list | dict | None = None


class NewsOut(BaseModel):
    news_id: str
    company_id: UUID
    domain: str | None = None
    title: str | None = None
    description: str | None = None
    category: str | None = None
    page_date: datetime | None = None


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
    lead_score: float | None = None
    gate_status: str | None = None


class CompanyListOut(BaseModel):
    items: list[CompanyListItemOut]
    total: int
    page: int
    page_size: int


class CompanyStatsOut(BaseModel):
    total: int
    high_intent: int
    medium_intent: int
    low_intent: int


class ScoopEnrichOut(BaseModel):
    count: int
    scoops: list[ScoopOut]


class NewsEnrichOut(BaseModel):
    count: int
    news: list[NewsOut]


class IntentEnrichOut(BaseModel):
    count: int
    signals: list[IntentOut]
