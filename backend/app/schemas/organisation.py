from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrganisationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    organisation_id: UUID
    account_name: str | None = None
    account_url: str | None = None
    account_logo_url: str | None = None
    timezone: str | None = None
    currency: str | None = None
    company_name: str
    website: str | None = None
    legal_business_name: str | None = None
    industry: str | None = None
    sub_industry: str | None = None
    headquarters_location: str | None = None
    founded_year: str | None = None
    employee_count_range: str | None = None
    annual_revenue_range: str | None = None
    business_type: str | None = None
    company_description: str | None = None
    # XSparks Offering Profile (brief sections 5, 6) - what the tenant sells,
    # used for relevance scoring. Never an ICP; never excludes a prospect.
    offering_profile: dict | None = None
    offering_profile_source_url: str | None = None
    offering_profile_status: str | None = None
    offering_profile_synced_at: datetime | None = None
    # AI-identified competitors ([{name, domain}]) from the Offering Profile
    # sync - read-only; keeps them out of ICP lead generation.
    competitors: list[dict] | None = None
    news_refreshed_at: datetime | None = None
    created_at: datetime | None = None


class CompetitorNewsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    competitor_news_id: UUID
    competitor_name: str
    competitor_domain: str | None = None
    title: str
    summary: str | None = None
    why_it_matters: str | None = None
    category: str
    url: str
    source_domain: str | None = None
    published_at: datetime | None = None
    discovered_at: datetime


class CompetitorNewsListOut(BaseModel):
    items: list[CompetitorNewsOut]
    # Last automatic news refresh (48h scheduler) - drives "Updated Xh ago".
    refreshed_at: datetime | None = None
    competitor_count: int = 0


class AiMarketNewsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ai_market_news_id: UUID
    company_name: str
    company_domain: str | None = None
    title: str
    summary: str | None = None
    # product_launch | funding | press_briefing | buying_signal
    category: str
    url: str
    source_domain: str | None = None
    published_at: datetime | None = None
    discovered_at: datetime


class AiMarketNewsListOut(BaseModel):
    items: list[AiMarketNewsOut]
    total: int = 0
    page: int = 1
    page_size: int = 10
    # Last automatic refresh (global) - drives "Updated Xh ago · next in ~Yh".
    refreshed_at: datetime | None = None
    refresh_interval_hours: int
    company_count: int = 0


class OfferingProfileSyncOut(BaseModel):
    status: str
    profile: dict


class WebsitePrefillIn(BaseModel):
    website: str


class WebsitePrefillOut(BaseModel):
    website: str | None = None
    status: str
    organisation: dict = {}
    offering_profile: dict | None = None


class OfferingProfileSeedIn(BaseModel):
    profile: dict
    source_url: str
