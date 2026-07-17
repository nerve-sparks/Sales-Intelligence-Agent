from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import company_directory, excel_pipeline, icp_filter
from app.schemas.company import CompanyListItemOut, CompanyListOut, CompanyStatsOut

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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


async def stats(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    counts = await company_directory.intent_counts(db, organisation_id)
    return CompanyStatsOut(
        total=counts["high"] + counts["medium"] + counts["low"],
        high_intent=counts["high"],
        medium_intent=counts["medium"],
        low_intent=counts["low"],
    )


async def export(organisation_id: UUID, icp_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    company_ids = None
    if icp_id is not None:
        icp = await icp_filter.get_icp_by_organisation(db, organisation_id, icp_id)
        if icp is None:
            raise HTTPException(status_code=404, detail="icp not found")
        matches = await icp_filter.filter_companies(db, icp)
        company_ids = {c.company_id for c in matches}

    rows = await company_directory.list_companies_for_export(db, organisation_id, company_ids)
    workbook_bytes = excel_pipeline.build_company_export_workbook(rows)

    return Response(
        content=workbook_bytes,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="companies_export.xlsx"'},
    )


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
