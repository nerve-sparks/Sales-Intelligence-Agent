from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import company_directory, excel_pipeline, icp_filter, llm_client, signal_directory
from app.schemas.company import (
    CompanyInsightOut,
    CompanyListItemOut,
    CompanyListOut,
    CompanyStatsOut,
    CountryLeadScoreOut,
    IcpThresholdsOut,
)

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def list_companies(
    organisation_id: UUID,
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
    import_batch_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    page_size = min(page_size, 100)
    rows, total = await company_directory.list_companies(
        db, organisation_id, page, page_size, search, import_batch_id
    )
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


async def stats(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    counts = await company_directory.intent_counts(db, organisation_id, import_batch_id)
    country_rows = await company_directory.lead_score_by_country(db, organisation_id, import_batch_id)
    return CompanyStatsOut(
        total=counts["high"] + counts["medium"] + counts["low"],
        high_intent=counts["high"],
        medium_intent=counts["medium"],
        low_intent=counts["low"],
        by_country=[
            CountryLeadScoreOut(country=country, avg_lead_score=float(avg or 0), company_count=count)
            for country, avg, count in country_rows
        ],
    )


async def icp_thresholds(organisation_id: UUID, db: AsyncSession = Depends(get_db)) -> IcpThresholdsOut:
    data = await company_directory.icp_thresholds(db, organisation_id)
    return IcpThresholdsOut(**data)


async def insight(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    counts = await company_directory.intent_counts(db, organisation_id)
    total = counts["high"] + counts["medium"] + counts["low"]
    if total == 0:
        return CompanyInsightOut(summary="No companies yet - upload a ZoomInfo export to get started.")

    gates = await company_directory.gate_summary(db, organisation_id)

    rows, _ = await company_directory.list_companies(db, organisation_id, page=1, page_size=5)
    top_companies = [
        {
            "name": company.company_name,
            "lead_score": round(lead_score, 1),
            "gate_status": gate_status,
            "industry": (company.industries or [None])[0],
            "country": company.country,
        }
        for company, lead_score, gate_status in rows
        if lead_score is not None
    ]

    signal_totals = await signal_directory.org_totals(db, organisation_id)
    category_rows = await signal_directory.counts_by_category(db, organisation_id)
    top_categories = [
        {"category": category, "count": count, "company_count": company_count}
        for category, count, company_count, _avg_confidence in category_rows[:3]
    ]
    actionable = await signal_directory.actionable_count(db, organisation_id)
    executives = await signal_directory.executives_impacted(db, organisation_id)

    avg_score_str = f"{gates['avg_lead_score']:.1f}" if gates["avg_lead_score"] is not None else "not yet available"

    prompt = (
        "You are a senior B2B sales intelligence analyst writing a daily pipeline briefing for a sales "
        "leader. Write a comprehensive, well-articulated briefing in 3 short paragraphs (no headings, "
        "no markdown, no bullet points, plain prose only):\n\n"
        "Paragraph 1 - Pipeline health: state the total company count, how many are qualified/active vs "
        "nurture (explain gate_status: active = passed reachability + economic-capacity checks, nurture = "
        "did not), the average lead score, and the high/medium/low intent-tier split.\n"
        "Paragraph 2 - Top opportunities: name the specific top-scored companies below with their lead "
        "scores, and give a concrete, specific reason each is worth pursuing now (industry, country, "
        "qualification status) - do not just repeat the raw numbers, interpret them for a sales leader.\n"
        "Paragraph 3 - Signal trends and recommended action: summarize which signal categories are most "
        "common right now, how many signals are directly actionable, how many real decision-makers are "
        "reachable at signaled companies, then give one concrete, specific recommendation for what the "
        "sales team should prioritize today.\n\n"
        "Reference the actual numbers throughout - never invent a number, company, or fact not given below. "
        "Confident, professional, analyst tone.\n\n"
        f"DATA:\n"
        f"- Companies: {total} total, {gates['active_count']} active (qualified), {gates['nurture_count']} "
        f"nurture, {gates['unscored_count']} not yet scored.\n"
        f"- Average lead score across scored companies: {avg_score_str} / 100.\n"
        f"- Intent tiers: {counts['high']} high, {counts['medium']} medium, {counts['low']} low.\n"
        f"- Top companies by lead score: {top_companies}.\n"
        f"- Signals: {signal_totals['total']} total across {signal_totals['company_count']} companies, "
        f"average confidence {round((signal_totals['avg_confidence'] or 0) * 100)}%.\n"
        f"- Most common signal categories: {top_categories}.\n"
        f"- Directly actionable signals: {actionable}.\n"
        f"- Real decision-makers reachable at signaled companies: {executives}."
    )

    try:
        summary = await llm_client.complete(
            [{"role": "user", "content": prompt}],
            generation_name="dashboard-company-overview",
            trace_user_id=str(organisation_id),
        )
    except llm_client.LLMNotConfiguredError:
        top_names = ", ".join(f"{c['name']} ({c['lead_score']})" for c in top_companies[:3]) or "none scored yet"
        summary = (
            f"{total} companies tracked - {gates['active_count']} active, {gates['nurture_count']} nurture, "
            f"{gates['unscored_count']} unscored. Average lead score: {avg_score_str}/100. "
            f"Intent split: {counts['high']} high, {counts['medium']} medium, {counts['low']} low. "
            f"Top scored: {top_names}. {signal_totals['total']} signals tracked, {actionable} actionable, "
            f"{executives} decision-makers reachable."
        )

    return CompanyInsightOut(summary=summary)


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
