"""Re-research + re-score a hand-picked set of companies ("Refresh selected"
on the Enterprise List, the company page's Refresh button, and the 48h news
scheduler's top prospects).

Every company is otherwise researched exactly once, at upload. A refresh runs
the same research_companies -> run_scoring path as an upload's retry, but for
an explicit list of companies and outside any upload batch - a company can sit
in several batches, so progress is tracked on the company itself
(Company.refresh_status), not on company_import_batch.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import Company
from app.services import evidence_scorer, search_signal_ingest
from app.services.offering_profile_service import ensure_offering_profile

logger = logging.getLogger(__name__)

QUEUED, RUNNING, DONE, FAILED = "queued", "running", "done", "failed"
IN_FLIGHT = (QUEUED, RUNNING)


async def queue_refresh(
    session: AsyncSession, workspace_id: UUID, company_ids: list[UUID]
) -> tuple[list[UUID], list[UUID], dict[UUID, datetime]]:
    """Marks the given companies queued. Commits. Returns (accepted, skipped,
    cooling_down):
      - skipped: already refreshing, or not in this workspace;
      - cooling_down: {company_id: available_at} for companies successfully
        refreshed within the last REFRESH_COOLDOWN_HOURS (48h)."""
    companies = (
        await session.execute(
            select(Company).where(Company.workspace_id == workspace_id, Company.company_id.in_(company_ids))
        )
    ).scalars().all()
    by_id = {c.company_id: c for c in companies}
    accepted: list[UUID] = []
    skipped: list[UUID] = []
    cooling_down: dict[UUID, datetime] = {}
    for cid in dict.fromkeys(company_ids):
        company = by_id.get(cid)
        if company is None or company.refresh_status in IN_FLIGHT:
            skipped.append(cid)
        elif company.refresh_available_at is not None:
            cooling_down[cid] = company.refresh_available_at
        else:
            accepted.append(cid)
    if accepted:
        await session.execute(
            update(Company)
            .where(Company.company_id.in_(accepted))
            .values(refresh_status=QUEUED, refresh_requested_at=datetime.now(timezone.utc))
        )
    await session.commit()
    print(f"[REFRESH] Queued {len(accepted)} compan{'y' if len(accepted) == 1 else 'ies'} for refresh"
          f"{f', skipped {len(skipped)} (already refreshing or not in this workspace)' if skipped else ''}"
          f"{f', {len(cooling_down)} refreshed in the last {get_settings().refresh_cooldown_hours}h (cooldown)' if cooling_down else ''}")
    return accepted, skipped, cooling_down


async def refresh_companies_in_background(organisation_id: UUID, workspace_id: UUID, company_ids: list[UUID]) -> None:
    """Background work for a refresh. Never raises: every company ends up
    done or failed, so the UI never shows a spinner forever."""
    if not company_ids:
        return
    started = datetime.now(timezone.utc)
    log_ctx = {"job_id": "refresh", "stage": "refresh"}
    logger.info("refresh started, %d companies", len(company_ids), extra=log_ctx)
    print(f"\n[REFRESH] >>> Refresh started for {len(company_ids)} compan{'y' if len(company_ids) == 1 else 'ies'} "
          f"(re-research + re-score)")
    try:
        async with async_session_maker() as session:
            await _set_status(session, company_ids, RUNNING)
            await ensure_offering_profile(session, organisation_id)
            await search_signal_ingest.research_companies(
                session, organisation_id, workspace_id, company_ids=company_ids, force_refresh=True,
            )
            await evidence_scorer.run_scoring(session, workspace_id, company_ids=company_ids)
            # research_companies stamps search_signals_fetched_at only when a
            # company's research actually succeeded - that is the per-company
            # outcome, without changing its return shape.
            fetched = dict(
                (
                    await session.execute(
                        select(Company.company_id, Company.search_signals_fetched_at).where(
                            Company.company_id.in_(company_ids)
                        )
                    )
                ).all()
            )
            done = [cid for cid in company_ids if fetched.get(cid) is not None and fetched[cid] >= started]
            failed = [cid for cid in company_ids if cid not in done]
            await _set_status(session, done, DONE)
            await _set_status(session, failed, FAILED)
            names = dict(
                (await session.execute(
                    select(Company.company_id, Company.company_name).where(Company.company_id.in_(company_ids))
                )).all()
            )
        logger.info("refresh finished: %d done, %d failed", len(done), len(failed), extra=log_ctx)
        print(f"[REFRESH] <<< Refresh finished: {len(done)} done, {len(failed)} failed")
        for cid in done:
            print(f"[REFRESH]       done:   {names.get(cid)}")
        for cid in failed:
            print(f"[REFRESH]       FAILED: {names.get(cid)} (research did not complete - check the [YOU]/[LLM] lines above)")
    except Exception as exc:
        print(f"[REFRESH] <<< Refresh CRASHED: {type(exc).__name__}: {exc} - marking in-flight companies failed")
        logger.exception("refresh failed", extra=log_ctx)
        async with async_session_maker() as session:
            await session.execute(
                update(Company)
                .where(Company.company_id.in_(company_ids), Company.refresh_status.in_(IN_FLIGHT))
                .values(refresh_status=FAILED)
            )
            await session.commit()


async def _set_status(session: AsyncSession, company_ids: list[UUID], status: str) -> None:
    if not company_ids:
        return
    await session.execute(update(Company).where(Company.company_id.in_(company_ids)).values(refresh_status=status))
    await session.commit()


async def fail_interrupted_refreshes() -> int:
    """Startup: a refresh in flight when the backend stopped is gone with the
    process (same reasoning as job_recovery.stop_interrupted_jobs) - mark it
    failed so the UI stops showing it as running and the user can retry."""
    async with async_session_maker() as session:
        result = await session.execute(
            update(Company).where(Company.refresh_status.in_(IN_FLIGHT)).values(refresh_status=FAILED)
        )
        await session.commit()
        if result.rowcount:
            print(f"[REFRESH] Startup: marked {result.rowcount} interrupted refresh(es) as failed")
        return result.rowcount or 0
