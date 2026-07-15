from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Company, Signal
from app.services.signal_extractor import extract_signals
from app.services.signal_scorer import rescore_signals
from app.views.signal_view import serialize_signal


async def extract(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    return await extract_signals(db, organisation_id)


async def rescore(organisation_id: UUID, db: AsyncSession = Depends(get_db)):
    return await rescore_signals(db, organisation_id)


async def get_signals(organisation_id: UUID, company_id: UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Signal)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Signal.company_id == company_id, Company.organisation_id == organisation_id)
        .order_by(Signal.signal_confidence.desc())
    )
    signals = (await db.execute(stmt)).scalars().all()
    return [serialize_signal(s) for s in signals]
