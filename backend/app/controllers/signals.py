from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import BuyingEvent
from app.services import buying_event_directory
from app.services.signal_extractor import extract_signals
from app.services.signal_scorer import rescore_signals
from app.schemas.signal import (
    ConfidenceBucketCount,
    CountryCount,
    SignalCategoryCount,
    SignalListOut,
    SignalOut,
    SignalStatsOut,
    SignalTrendPoint,
    SignalWithCompanyOut,
    SourceCount,
)


async def extract(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    """Legacy - inert. Nothing populates CompanyNews/CompanyScoop anymore
    (brief item 14), so this always returns {inserted: 0, skipped: 0}.
    Retained for backward compatibility only; the active pipeline researches
    via Tavily straight into BuyingEvent (search_signal_ingest)."""
    return await extract_signals(db, organisation_id)


async def rescore(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    """Legacy - inert for the same reason as extract() above."""
    return await rescore_signals(db, organisation_id)


def _event_fields(event: BuyingEvent) -> dict:
    return dict(
        buying_event_id=event.buying_event_id,
        event_type=event.event_type,
        category=event.category,
        title=event.title,
        summary=event.summary,
        published_at=event.published_at,
        base_strength=float(event.base_strength) if event.base_strength is not None else None,
        relevance=float(event.relevance) if event.relevance is not None else None,
        freshness=float(event.freshness) if event.freshness is not None else None,
        source_quality=float(event.source_quality) if event.source_quality is not None else None,
        extraction_confidence=float(event.extraction_confidence) if event.extraction_confidence is not None else None,
        status_factor=float(event.status_factor) if event.status_factor is not None else None,
        event_score=float(event.event_score) if event.event_score is not None else None,
        is_negative=event.is_negative,
        penalty_value=float(event.penalty_value) if event.penalty_value is not None else None,
        best_offering=event.best_offering,
        reasoning=event.reasoning,
        evidence=event.evidence,
        public_budget_usd=float(event.public_budget_usd) if event.public_budget_usd is not None else None,
        budget_currency=event.budget_currency,
        budget_confidence=event.budget_confidence,
    )


def _with_company(event: BuyingEvent, company_name: str) -> SignalWithCompanyOut:
    return SignalWithCompanyOut(company_id=event.company_id, company_name=company_name, **_event_fields(event))


async def list_all(
    organisation_id: UUID,
    page: int = 1,
    page_size: int = 25,
    category: str | None = None,
    import_batch_id: UUID | None = None,
    event_type: str | None = None,
    min_score: float | None = None,
    sector: str | None = None,
    sort: str = "date",
    db: AsyncSession = Depends(get_db),
):
    """Signal Feed listing. Every sort is descending (see SORT_KEYS) - an
    unknown value falls back to date rather than erroring, so a stale bookmark
    still returns a sensible feed."""
    page_size = min(page_size, 100)
    if sort not in buying_event_directory.SORT_KEYS:
        sort = "date"
    rows, total = await buying_event_directory.list_events(
        db, organisation_id, page, page_size, category, import_batch_id,
        event_type=event_type, min_score=min_score, sector=sector, sort=sort,
    )
    items = [_with_company(event, company_name) for event, company_name in rows]
    return SignalListOut(items=items, total=total, page=page, page_size=page_size)


async def get_by_id(organisation_id: UUID, signal_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await buying_event_directory.get_event(db, organisation_id, signal_id)
    if row is None:
        raise HTTPException(status_code=404, detail="signal not found")
    event, company_name = row
    return _with_company(event, company_name)


async def stats(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    counts = await buying_event_directory.relevance_counts(db, organisation_id, import_batch_id)
    category_rows = await buying_event_directory.counts_by_category(db, organisation_id, import_batch_id)
    trend_rows = await buying_event_directory.trend_by_day(db, organisation_id, import_batch_id)
    top_rows = await buying_event_directory.top_events(db, organisation_id, import_batch_id=import_batch_id)
    totals = await buying_event_directory.org_totals(db, organisation_id, import_batch_id)
    histogram_rows = await buying_event_directory.confidence_histogram(db, organisation_id, import_batch_id)
    country_rows = await buying_event_directory.counts_by_country(db, organisation_id, import_batch_id=import_batch_id)
    source_rows = await buying_event_directory.top_sources(db, organisation_id, import_batch_id=import_batch_id)
    executives_impacted = await buying_event_directory.executives_impacted(db, organisation_id, import_batch_id)
    actionable = await buying_event_directory.actionable_count(db, organisation_id, import_batch_id)

    return SignalStatsOut(
        total=counts["high"] + counts["medium"] + counts["low"],
        high_relevance=counts["high"],
        medium_relevance=counts["medium"],
        low_relevance=counts["low"],
        company_count=totals["company_count"],
        avg_confidence=totals["avg_confidence"],
        executives_impacted=executives_impacted,
        actionable_count=actionable,
        by_category=[
            SignalCategoryCount(
                signal_category=category,
                count=count,
                company_count=company_count,
                avg_confidence=float(avg_confidence) if avg_confidence is not None else None,
            )
            for category, count, company_count, avg_confidence in category_rows
        ],
        trend=[
            SignalTrendPoint(date=str(point["date"]), total=point["total"], high=point["high"], medium=point["medium"], low=point["low"])
            for point in trend_rows
        ],
        top_signals=[_with_company(event, company_name) for event, company_name in top_rows],
        histogram=[ConfidenceBucketCount(bucket=row["bucket"], count=row["count"]) for row in histogram_rows],
        by_country=[CountryCount(country=country, count=count) for country, count in country_rows],
        by_source=[SourceCount(source=row["source"], count=row["count"]) for row in source_rows],
    )


async def get_signals(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    events = await buying_event_directory.get_events_for_company(db, organisation_id, company_id)
    return [SignalOut(company_id=e.company_id, **_event_fields(e)) for e in events]
