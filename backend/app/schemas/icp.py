from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.company import CompanyWithDecisionMakersOut


class IcpOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    icp_id: UUID
    name: str | None = None
    industries: list[str] | None = None
    employee_min: int | None = None
    employee_max: int | None = None
    revenue_min_usd: int | None = None
    revenue_max_usd: int | None = None
    countries: list[str] | None = None
    technologies: list[str] | None = None
    buying_committee_personas: list[str] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class IcpCompaniesOut(BaseModel):
    icp: IcpOut
    match_count: int
    companies: list[CompanyWithDecisionMakersOut]
