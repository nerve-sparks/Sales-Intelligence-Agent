import json
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import llm_client
from app.services.organisation_service import create_organisation, get_organisation
from app.schemas.organisation import IcpRecommendationOut, IcpRecommendationsOut

# Same real ZoomInfo values used by the frontend's ICP dropdowns (see
# INDUSTRY_OPTIONS/ICP_COUNTRY_OPTIONS in SettingsIcpDataPage.tsx/OnboardingPage.tsx)
# - given to the LLM so it can't hallucinate a plausible-sounding label that
# matches zero real companies, the exact bug that motivated pulling this list
# from real data in the first place.
REAL_INDUSTRIES = [
    "Business Services", "Construction", "Education", "Energy, Utilities & Waste",
    "Finance", "Healthcare Services", "Hospitality", "Hospitals & Physicians Clinics",
    "Insurance", "Manufacturing", "Media & Internet", "Minerals & Mining",
    "Real Estate", "Retail", "Software", "Telecommunications", "Transportation",
]
REAL_COUNTRIES = [
    "United States", "Canada", "United Kingdom", "India", "Australia",
    "Germany", "Israel", "Russia", "Belgium", "Ireland", "Denmark",
    "Singapore", "Sweden", "Finland", "France",
]


class OrganisationCreate(BaseModel):
    # Onboarding step 1 - account identity
    account_name: str | None = None
    account_url: str | None = None
    account_logo_url: str | None = None
    timezone: str | None = None
    currency: str | None = None
    # Onboarding step 2 - company profile
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


async def create(payload: OrganisationCreate, db: AsyncSession = Depends(get_db)):
    return await create_organisation(db, payload.model_dump())


async def get(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    org = await get_organisation(db, organisation_id)
    if org is None:
        raise HTTPException(status_code=404, detail="organisation not found")
    return org


async def icp_recommendations(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    org = await get_organisation(db, organisation_id)
    if org is None:
        raise HTTPException(status_code=404, detail="organisation not found")

    prompt = (
        "You are a B2B go-to-market strategist. A company just described itself as follows:\n"
        f"- Company name: {org.company_name}\n"
        f"- Industry: {org.industry or 'not specified'}\n"
        f"- Business type: {org.business_type or 'not specified'}\n"
        f"- Employees: {org.employee_count_range or 'not specified'}\n"
        f"- Annual revenue: {org.annual_revenue_range or 'not specified'}\n"
        f"- Headquarters: {org.headquarters_location or 'not specified'}\n"
        f"- Description: {org.company_description or 'not specified'}\n\n"
        "Suggest 2-3 distinct Ideal Customer Profiles (ICPs) this company should target as B2B "
        "prospects - i.e. what KIND of companies would likely buy from this company, not a "
        "restatement of the company itself.\n\n"
        f"Only use these exact industry values: {REAL_INDUSTRIES}\n"
        f"Only use these exact country values: {REAL_COUNTRIES}\n\n"
        "Respond with ONLY a JSON array (no markdown, no prose before or after), where each item "
        "has exactly these keys: name (string), industries (array of 1-2 values from the list "
        "above), employee_min (int), employee_max (int), revenue_min_usd (int), revenue_max_usd "
        "(int), countries (array of 1-3 values from the list above), rationale (one sentence, "
        "plain English, referencing why this fits the company's own profile)."
    )

    recommendations: list[IcpRecommendationOut] = []
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": prompt}],
            generation_name="organisation-icp-recommendations",
            trace_user_id=str(organisation_id),
        )
        start, end = raw.find("["), raw.rfind("]")
        parsed = json.loads(raw[start : end + 1])
        recommendations = [IcpRecommendationOut(**item) for item in parsed]
    except llm_client.LLMNotConfiguredError:
        pass
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        # Model didn't return parseable JSON - degrade to an empty list
        # rather than showing a broken/partial recommendation.
        pass

    return IcpRecommendationsOut(recommendations=recommendations)
