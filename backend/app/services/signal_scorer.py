from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, Signal
from app.services.signal_extractor import compute_m3, compute_m4, compute_signal_confidence


async def rescore_signals(session: AsyncSession, organisation_id) -> dict:
    stmt = (
        select(Signal)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    signals = (await session.execute(stmt)).scalars().all()

    for sig in signals:
        m2 = float(sig.m2_corroboration) if sig.m2_corroboration is not None else 1.00
        m3 = compute_m3(sig.ingested_at)
        m4 = compute_m4(bool(sig.is_action))

        sig.m3_recency = m3
        sig.signal_confidence = compute_signal_confidence(m2, m3, m4)
        sig.scored_at = datetime.now(timezone.utc)

    await session.commit()
    return {"rescored": len(signals)}
