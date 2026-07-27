from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, CompanyImportBatch
from app.services import company_directory, excel_pipeline, llm_client, signal_directory
from app.schemas.company import (
    CompanyInsightOut,
    CompanyListItemOut,
    CompanyListOut,
    CompanyStatsOut,
    CountryLeadScoreOut,
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
    def _num(v):
        return float(v) if v is not None else None

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
            lead_score=_num(ls.lead_score) if ls else None,
            sales_status=ls.sales_status if ls else None,
            confidence_label=ls.confidence_label if ls else None,
            buying_evidence_score=_num(ls.buying_evidence_score) if ls else None,
            contact_access_score=_num(ls.contact_access_score) if ls else None,
            negative_event_score=_num(ls.negative_event_score) if ls else None,
            best_offering=ls.best_offering if ls else None,
            why_now=ls.why_now if ls else None,
            expected_deal_value_usd=_num(ls.expected_deal_value_usd) if ls else None,
        )
        for company, ls in rows
    ]
    return CompanyListOut(items=items, total=total, page=page, page_size=page_size)


async def stats(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Evidence-based company stats (brief items 22, 4): sales-status bands +
    confidence + provisional pipeline value, optionally batch-scoped."""
    summary = await company_directory.sales_status_summary(db, organisation_id, import_batch_id)
    country_rows = await company_directory.lead_score_by_country(db, organisation_id, import_batch_id)
    return CompanyStatsOut(
        total=summary["total"],
        scored=summary["scored"],
        unscored=summary["unscored"],
        sales_ready=summary["sales_ready"],
        high_priority=summary["high_priority"],
        warm=summary["warm"],
        monitor=summary["monitor"],
        low_priority=summary["low_priority"],
        high_confidence=summary["high_confidence"],
        provisional_pipeline_value=summary["pipeline_value"],
        by_country=[
            CountryLeadScoreOut(country=country, avg_lead_score=float(avg or 0), company_count=count)
            for country, avg, count in country_rows
        ],
    )


async def insight(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    """Dashboard briefing over the evidence-based pipeline (brief section 29).
    No gates, no ICP - framed around Buying Evidence + Contact Access -
    Negative Evidence, sales-status bands, and expected pipeline value."""
    summary_data = await company_directory.sales_status_summary(db, organisation_id)
    total = summary_data["total_scored"]
    if total == 0:
        return CompanyInsightOut(summary="No scored companies yet - upload prospect data to begin research and scoring.")

    rows, _ = await company_directory.list_companies(db, organisation_id, page=1, page_size=5)
    top_companies = [
        {
            "name": company.company_name,
            "lead_score": round(float(ls.lead_score), 1),
            "sales_status": ls.sales_status,
            "confidence": ls.confidence_label,
            "best_offering": ls.best_offering,
            "why_now": ls.why_now,
            "expected_deal_value_usd": float(ls.expected_deal_value_usd) if ls.expected_deal_value_usd is not None else None,
        }
        for company, ls in rows
        if ls is not None and ls.lead_score is not None
    ]

    avg_score_str = f"{summary_data['avg_lead_score']:.1f}" if summary_data["avg_lead_score"] is not None else "not yet available"
    pipeline_value = summary_data["pipeline_value"]

    prompt = (
        "You are a senior B2B sales intelligence analyst for XSparks (an AI solutions partner), writing a "
        "daily pipeline briefing. Scoring is evidence-based: Lead Score = Buying Evidence + Contact Access "
        "- Negative Evidence (0-100); revenue/funding affect only Expected Deal Value, never the Lead "
        "Score; confidence is separate from score. Write 3 short plain-prose paragraphs (no headings, no "
        "markdown, no bullets):\n\n"
        "Paragraph 1 - Pipeline health: total scored companies, the sales-status split (Sales Ready / High "
        "Priority / Warm / Monitor / Low Priority), the average lead score, and the estimated pipeline "
        "value.\n"
        "Paragraph 2 - Top opportunities: name the specific top-scored companies, their lead scores, the "
        "best XSparks offering and why-now for each - interpret for a sales leader, don't just repeat "
        "numbers.\n"
        "Paragraph 3 - Recommended action: one concrete recommendation for what the team should prioritise "
        "today, grounded in the evidence.\n\n"
        "Never invent a number, company, or fact not given below. Confident, professional analyst tone.\n\n"
        f"DATA:\n"
        f"- Scored companies: {total}. Sales Ready {summary_data['sales_ready']}, High Priority "
        f"{summary_data['high_priority']}, Warm {summary_data['warm']}, Monitor {summary_data['monitor']}, "
        f"Low Priority {summary_data['low_priority']}.\n"
        f"- Average lead score: {avg_score_str} / 100.\n"
        f"- Estimated pipeline value (sum of expected deal values): ${pipeline_value:,.0f}.\n"
        f"- Top companies: {top_companies}."
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
            f"{total} companies scored - {summary_data['sales_ready']} Sales Ready, "
            f"{summary_data['high_priority']} High Priority, {summary_data['warm']} Warm, "
            f"{summary_data['monitor']} Monitor, {summary_data['low_priority']} Low Priority. "
            f"Average lead score {avg_score_str}/100. Estimated pipeline value ${pipeline_value:,.0f}. "
            f"Top scored: {top_names}."
        )

    return CompanyInsightOut(summary=summary)


async def export(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    """Evidence-based company export (brief section 23). Optionally scoped to a
    single upload via import_batch_id; no ICP."""
    company_ids = None
    if import_batch_id is not None:
        # Permanent membership table (item 5), not Company.import_batch_id -
        # a later re-upload of the same company must not exclude it from an
        # earlier batch's export.
        company_ids = set(
            (
                await db.execute(
                    select(Company.company_id).where(
                        Company.organisation_id == organisation_id,
                        Company.company_id.in_(
                            select(CompanyImportBatch.company_id).where(
                                CompanyImportBatch.import_batch_id == import_batch_id
                            )
                        ),
                    )
                )
            ).scalars().all()
        )

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
