from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, Signal
from app.services import signal_directory
from app.services.signal_extractor import extract_signals
from app.services.signal_scorer import rescore_signals
from app.schemas.signal import SignalListOut, SignalWithCompanyOut


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
    organisation_id: UUID, page: int = 1, page_size: int = 25, db: AsyncSession = Depends(get_db)
):
    page_size = min(page_size, 100)
    rows, total = await signal_directory.list_signals(db, organisation_id, page, page_size)
    items = [_with_company(signal, company_name) for signal, company_name in rows]
    return SignalListOut(items=items, total=total, page=page, page_size=page_size)


async def get_by_id(organisation_id: UUID, signal_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await signal_directory.get_signal(db, organisation_id, signal_id)
    if row is None:
        raise HTTPException(status_code=404, detail="signal not found")
    signal, company_name = row
    return _with_company(signal, company_name)


async def get_signals(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Signal)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Signal.company_id == company_id, Company.organisation_id == organisation_id)
        .order_by(Signal.signal_confidence.desc())
    )
    return (await db.execute(stmt)).scalars().all()
