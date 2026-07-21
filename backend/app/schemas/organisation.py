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
    created_at: datetime | None = None


class IcpRecommendationOut(BaseModel):
    name: str
    industries: list[str] = []
    employee_min: int | None = None
    employee_max: int | None = None
    revenue_min_usd: int | None = None
    revenue_max_usd: int | None = None
    countries: list[str] = []
    rationale: str


class IcpRecommendationsOut(BaseModel):
    recommendations: list[IcpRecommendationOut] = []
