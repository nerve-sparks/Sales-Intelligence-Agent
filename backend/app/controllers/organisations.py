from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedFirebaseUser, require_firebase_user, require_organisation_member
from app.core.db import get_db
from app.services.organisation_service import create_organisation, get_organisation, update_organisation


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


# Deliberately narrower than OrganisationCreate - this is what Settings'
# Organization panel actually collects (mirrors onboarding's trimmed
# Organization Setup form). All fields optional and excluded when unset, so
# a Settings save never touches columns it doesn't show (timezone/currency/
# employee_count_range/annual_revenue_range/sub_industry/founded_year/
# business_type/account_url).
class OrganisationUpdate(BaseModel):
    company_name: str | None = None
    website: str | None = None
    legal_business_name: str | None = None
    industry: str | None = None
    headquarters_location: str | None = None
    company_description: str | None = None
    account_logo_url: str | None = None


async def create(
    payload: OrganisationCreate,
    db: AsyncSession = Depends(get_db),
    _firebase_user: VerifiedFirebaseUser = Depends(require_firebase_user),
):
    return await create_organisation(db, payload.model_dump())


async def get(
    organisation_id: UUID,
    db: AsyncSession = Depends(get_db),
    _member: object = Depends(require_organisation_member),
):
    org = await get_organisation(db, organisation_id)
    if org is None:
        raise HTTPException(status_code=404, detail="organisation not found")
    return org


async def update(
    organisation_id: UUID,
    payload: OrganisationUpdate,
    db: AsyncSession = Depends(get_db),
    _member: object = Depends(require_organisation_member),
):
    org = await update_organisation(db, organisation_id, payload.model_dump(exclude_unset=True))
    if org is None:
        raise HTTPException(status_code=404, detail="organisation not found")
    return org
