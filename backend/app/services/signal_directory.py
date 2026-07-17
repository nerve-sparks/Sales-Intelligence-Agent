"""Read-only, org-wide signal queries (cross-company feed + single-signal
lookup) - see signal_extractor.py / signal_scorer.py for the extraction and
scoring logic these rows come from.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, Signal


async def list_signals(session: AsyncSession, organisation_id: UUID, page: int, page_size: int):
    stmt = (
        select(Signal, Company.company_name)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
    )

    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = stmt.order_by(Signal.ingested_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(stmt)).all()
    return rows, total


async def get_signal(session: AsyncSession, organisation_id: UUID, signal_id: UUID):
    stmt = (
        select(Signal, Company.company_name)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Signal.signal_id == signal_id, Company.organisation_id == organisation_id)
    )
    return (await session.execute(stmt)).first()
