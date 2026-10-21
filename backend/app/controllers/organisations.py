from uuid import UUID

from fastapi import BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import VerifiedAuthUser, require_auth_user, require_organisation_member
from app.core.config import get_settings
from app.core.db import get_db
from app.models import Organisation
from app.schemas.organisation import (
    AiMarketNewsListOut,
    AiMarketNewsOut,
    CompetitorNewsListOut,
    CompetitorNewsOut,
    OfferingProfileSeedIn,
    WebsitePrefillIn,
)
from app.services import competitor_news_service
from app.services import ai_market_news_service, news_scheduler
from app.services.offering_profile_service import seed_offering_profile, sync_offering_profile
from app.services.organisation_service import create_organisation, get_organisation, update_organisation
from app.services.organisation_website_intelligence import prefill_from_website
from app.services.starter_icp import refresh_starter_icps_in_background


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
    _auth_user: VerifiedAuthUser = Depends(require_auth_user),
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


async def sync_offering_profile_endpoint(
    organisation_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _member: object = Depends(require_organisation_member),
):
    """Re-fetch the tenant Offering Profile from their website (you.com + LLM),
    falling back cleanly if unavailable. Never 500s on failure."""
    result = await sync_offering_profile(db, organisation_id)
    # A (still-unedited) Starter ICP is re-filled from the new profile.
    background_tasks.add_task(refresh_starter_icps_in_background, organisation_id)
    return result


async def prefill_from_website_endpoint(
    payload: WebsitePrefillIn,
    _auth_user: VerifiedAuthUser = Depends(require_auth_user),
):
    """Onboarding: research a URL before an organisation exists."""
    del _auth_user
    return await prefill_from_website(payload.website)


async def seed_offering_profile_endpoint(
    organisation_id: UUID,
    payload: OfferingProfileSeedIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _member: object = Depends(require_organisation_member),
):
    del _member
    result = await seed_offering_profile(db, organisation_id, payload.profile, payload.source_url)
    # A (still-unedited) Starter ICP is re-filled from the new profile.
    background_tasks.add_task(refresh_starter_icps_in_background, organisation_id)
    return result


async def list_competitor_news(
    organisation_id: UUID,
    days: int = 30,
    limit: int = 20,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
    _member: object = Depends(require_organisation_member),
) -> CompetitorNewsListOut:
    """Dashboard Competitor News tab: news about the AI-identified
    competitors, newest first, within the retention window."""
    settings = get_settings()
    days = max(1, min(days, settings.news_retention_days))
    limit = max(1, min(limit, settings.news_list_max_items))
    rows = await competitor_news_service.list_news(db, organisation_id, days, limit, category)
    print(f"[NEWS] Competitor News: {len(rows)} item(s) returned (last {days} days)")
    org = await db.get(Organisation, organisation_id)
    return CompetitorNewsListOut(
        items=[CompetitorNewsOut.model_validate(r) for r in rows],
        refreshed_at=org.news_refreshed_at if org is not None else None,
        competitor_count=len(org.competitors or []) if org is not None else 0,
    )


async def refresh_competitor_news(
    organisation_id: UUID,
    background_tasks: BackgroundTasks,
    _member: object = Depends(require_organisation_member),
):
    """Manual "Refresh competitor news" - runs in the background."""
    print("[NEWS] Manual 'Refresh competitor news' requested - running in the background")
    background_tasks.add_task(competitor_news_service.refresh_competitor_news_in_background, organisation_id)
    return {"status": "started"}


async def list_ai_news(
    organisation_id: UUID,
    days: int = 30,
    page: int = 1,
    page_size: int = 10,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
    _member: object = Depends(require_organisation_member),
) -> AiMarketNewsListOut:
    """Dashboard Latest News: news about the top global AI companies (shared
    by every organisation), newest first, within the retention window, paged."""
    settings = get_settings()
    if category is not None and category not in ai_market_news_service.CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Unknown news category: {category}")
    days = max(1, min(days, settings.news_retention_days))
    page = max(1, page)
    page_size = max(1, min(page_size, settings.news_list_max_items))
    rows = await ai_market_news_service.list_news(db, days, page_size, category, offset=(page - 1) * page_size)
    total = await ai_market_news_service.count_news(db, days, category)
    companies = await ai_market_news_service.stored_companies(db)
    print(f"[NEWS] Latest News ({category or 'all'}) page {page}: {len(rows)} of {total} item(s) "
          f"from {len(companies)} tracked AI companies (last {days} days)")
    return AiMarketNewsListOut(
        items=[AiMarketNewsOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        refreshed_at=await news_scheduler.last_run_at(db),
        refresh_interval_hours=settings.news_refresh_interval_hours,
        company_count=len(companies),
    )
