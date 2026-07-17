from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import company_directory
from app.schemas.company import CompanyListItemOut, CompanyListOut


async def list_companies(
    organisation_id: UUID,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    page_size = min(page_size, 100)
    rows, total = await company_directory.list_companies(db, organisation_id, page, page_size, search)
    items = [
        CompanyListItemOut(
            company_id=company.company_id,
            company_name=company.company_name,
            company_domain=company.company_domain,
            city=company.city,
            state=company.state,
            country=company.country,
            employee_count=company.employee_count,
            employee_range=company.employee_range,
            revenue_usd=company.revenue_usd,
            revenue_range=company.revenue_range,
            industries=company.industries,
            logo_url=company.logo_url,
            lead_score=lead_score,
            gate_status=gate_status,
        )
        for company, lead_score, gate_status in rows
    ]
    return CompanyListOut(items=items, total=total, page=page, page_size=page_size)


async def get_company(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    company = await company_directory.get_company(db, organisation_id, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="company not found")
    return company


async def list_decision_makers(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    return await company_directory.list_decision_makers(db, organisation_id, company_id)


async def get_decision_maker(
    organisation_id: UUID, decision_maker_id: UUID, db: AsyncSession = Depends(get_db)
):
    dm = await company_directory.get_decision_maker(db, organisation_id, decision_maker_id)
    if dm is None:
        raise HTTPException(status_code=404, detail="decision maker not found")
    return dm
