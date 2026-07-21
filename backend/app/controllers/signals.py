from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, Signal
from app.services import signal_directory
from app.services.signal_extractor import extract_signals
from app.services.signal_scorer import rescore_signals
from app.schemas.signal import (
    ConfidenceBucketCount,
    CountryCount,
    SignalCategoryCount,
    SignalListOut,
    SignalStatsOut,
    SignalTrendPoint,
    SignalWithCompanyOut,
    SourceCount,
)


async def extract(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    return await extract_signals(db, organisation_id)


async def rescore(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    return await rescore_signals(db, organisation_id)


def _with_company(signal: Signal, company_name: str) -> SignalWithCompanyOut:
    return SignalWithCompanyOut(
        signal_id=signal.signal_id,
        company_id=signal.company_id,
        company_name=company_name,
        source=signal.source,
        original_source=signal.original_source,
        signal_type=signal.signal_type,
        signal_category=signal.signal_category,
        core_fact=signal.core_fact,
        dollar_value_usd=signal.dollar_value_usd,
        extraction_method=signal.extraction_method,
        extraction_confidence=signal.extraction_confidence,
        is_action=signal.is_action,
        m2_corroboration=signal.m2_corroboration,
        m3_recency=signal.m3_recency,
        m4_resourcing=signal.m4_resourcing,
        signal_confidence=signal.signal_confidence,
        ingested_at=signal.ingested_at,
        scored_at=signal.scored_at,
    )


async def list_all(
    organisation_id: UUID,
    page: int = 1,
    page_size: int = 25,
    category: str | None = None,
    import_batch_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    page_size = min(page_size, 100)
    rows, total = await signal_directory.list_signals(
        db, organisation_id, page, page_size, category, import_batch_id
    )
    items = [_with_company(signal, company_name) for signal, company_name in rows]
    return SignalListOut(items=items, total=total, page=page, page_size=page_size)


async def get_by_id(organisation_id: UUID, signal_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await signal_directory.get_signal(db, organisation_id, signal_id)
    if row is None:
        raise HTTPException(status_code=404, detail="signal not found")
    signal, company_name = row
    return _with_company(signal, company_name)


async def stats(organisation_id: UUID, import_batch_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    counts = await signal_directory.intent_counts(db, organisation_id, import_batch_id)
    category_rows = await signal_directory.counts_by_category(db, organisation_id, import_batch_id)
    trend_rows = await signal_directory.trend_by_day(db, organisation_id, import_batch_id)
    top_rows = await signal_directory.top_signals(db, organisation_id, import_batch_id=import_batch_id)
    totals = await signal_directory.org_totals(db, organisation_id, import_batch_id)
    histogram_rows = await signal_directory.confidence_histogram(db, organisation_id, import_batch_id)
    country_rows = await signal_directory.counts_by_country(db, organisation_id, import_batch_id=import_batch_id)
    source_rows = await signal_directory.top_sources(db, organisation_id, import_batch_id=import_batch_id)
    executives_impacted = await signal_directory.executives_impacted(db, organisation_id, import_batch_id)
    actionable_count = await signal_directory.actionable_count(db, organisation_id, import_batch_id)

    return SignalStatsOut(
        total=counts["high"] + counts["medium"] + counts["low"],
        high_intent=counts["high"],
        medium_intent=counts["medium"],
        low_intent=counts["low"],
        company_count=totals["company_count"],
        avg_confidence=totals["avg_confidence"],
        executives_impacted=executives_impacted,
        actionable_count=actionable_count,
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
        top_signals=[_with_company(signal, company_name) for signal, company_name in top_rows],
        histogram=[ConfidenceBucketCount(bucket=row["bucket"], count=row["count"]) for row in histogram_rows],
        by_country=[CountryCount(country=country, count=count) for country, count in country_rows],
        by_source=[SourceCount(source=row["source"], count=row["count"]) for row in source_rows],
    )


async def get_signals(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Signal)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Signal.company_id == company_id, Company.organisation_id == organisation_id)
        .order_by(Signal.signal_confidence.desc())
    )
    return (await db.execute(stmt)).scalars().all()
