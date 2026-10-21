"""Automatic dashboard-news refresh, every NEWS_REFRESH_INTERVAL_HOURS (72h).

The dashboard's Latest News card shows news about the top 50 global AI
companies (ai_market_news_service). That feed is global - the same for every
organisation - so ONE refresh per interval serves everyone.

An in-process asyncio loop (started from main.lifespan) is enough: the backend
runs as a single uvicorn process. The run is claimed atomically in
scheduled_job_run BEFORE the work starts, so a restart mid-run or a second
instance never double-runs it - and a failed run (e.g. LLM out of budget)
still waits for the next window instead of retrying every wake-up.
"""

import asyncio
import contextlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import ScheduledJobRun
from app.services import ai_market_news_service, llm_client, you_client

logger = logging.getLogger(__name__)

WAKE_INTERVAL_SECONDS = 3600
AI_NEWS_JOB = "ai_market_news"


async def claim_due_job(session: AsyncSession, job_key: str, now: datetime) -> bool:
    """Atomically records a run of `job_key` if (and only if) it is due.
    Returns whether this caller won the claim. Commits."""
    due_before = now - timedelta(hours=get_settings().news_refresh_interval_hours)
    stmt = insert(ScheduledJobRun).values(job_key=job_key, last_run_at=now)
    stmt = stmt.on_conflict_do_update(
        index_elements=["job_key"],
        set_={"last_run_at": now},
        where=or_(ScheduledJobRun.last_run_at < due_before),
    )
    result = await session.execute(stmt)
    await session.commit()
    return (result.rowcount or 0) == 1


async def last_run_at(session: AsyncSession, job_key: str = AI_NEWS_JOB) -> datetime | None:
    row = await session.get(ScheduledJobRun, job_key)
    return row.last_run_at if row is not None else None


async def run_due(now: datetime | None = None) -> bool:
    """Runs the AI news refresh if it is due. Returns whether it ran."""
    if not you_client.is_configured() or not llm_client.is_configured():
        print("[NEWS] Scheduler tick: skipped - web search or LLM is not configured")
        return False
    now = now or datetime.now(timezone.utc)
    async with async_session_maker() as session:
        claimed = await claim_due_job(session, AI_NEWS_JOB, now)
    if not claimed:
        print(f"[NEWS] Scheduler tick: AI news not due yet (every {get_settings().news_refresh_interval_hours}h)")
        return False
    print(f"[NEWS] Scheduler tick: AI news refresh is due - running")
    await ai_market_news_service.refresh_ai_market_news_in_background()
    return True


async def _loop() -> None:
    while True:
        try:
            await run_due()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("news scheduler tick failed")
        await asyncio.sleep(WAKE_INTERVAL_SECONDS)


def start() -> asyncio.Task | None:
    settings = get_settings()
    if not settings.news_refresh_enabled:
        print("[NEWS] Scheduler disabled (NEWS_REFRESH_ENABLED=false)")
        return None
    print(f"[NEWS] Scheduler started: top-{ai_market_news_service.TOP_N} AI company news every "
          f"{settings.news_refresh_interval_hours}h, checked hourly")
    return asyncio.create_task(_loop(), name="news-scheduler")


async def stop(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
