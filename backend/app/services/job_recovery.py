"""Startup handling for jobs interrupted by a backend stop (crash, dev
restart, deploy) - a stopped backend means the job stopped too, not
"silently continue in the background without telling anyone."

score_companies_in_background runs as an in-process asyncio task kicked off
by FastAPI's BackgroundTasks - if the app process stops while a job is
mid-flight, that task is gone with it, and IcpImportBatch.research_status is
left at 'pending' forever with no in-memory work left to finish it. On
startup, stop_interrupted_jobs() finds every such job and marks it - and any
of its companies still stuck in a non-terminal stage (queued/researching/
scoring/retrying) - as stopped, instead of transparently re-launching the
research/scoring pipeline for it. A dev restarting the backend for an
unrelated reason should see an honest "stopped, retry if you want" state in
the UI, not unexplained background activity resuming on its own. Companies
that already finished scoring before the stop keep their real results
untouched; only the still-in-flight ones are marked 'failed', which is
retryable via the existing POST .../retry-failed endpoint.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.core.db import async_session_maker
from app.models import CompanyImportBatch, IcpImportBatch
from app.services import company_batch_status

logger = logging.getLogger(__name__)

STOPPED_MESSAGE = "Processing stopped: the backend was restarted before this company finished."


async def stop_interrupted_jobs() -> int:
    """Marks every batch left at research_status='pending' (interrupted
    mid-flight by the process's last stop) as stopped/complete_with_warnings,
    and any of its companies still in a non-terminal stage as failed
    (retryable). Returns how many batches were stopped."""
    async with async_session_maker() as session:
        batch_ids = (
            await session.execute(
                select(IcpImportBatch.import_batch_id).where(IcpImportBatch.research_status == "pending")
            )
        ).scalars().all()

        for import_batch_id in batch_ids:
            logger.info(
                "stopping interrupted job (backend restarted mid-flight, not resuming)",
                extra={"job_id": str(import_batch_id), "stage": "job"},
            )
            in_flight_ids = (
                await session.execute(
                    select(CompanyImportBatch.company_id).where(
                        CompanyImportBatch.import_batch_id == import_batch_id,
                        CompanyImportBatch.status.notin_(company_batch_status.TERMINAL_STATUSES),
                    )
                )
            ).scalars().all()
            for company_id in in_flight_ids:
                await company_batch_status.mark_failed(
                    session, company_id, import_batch_id, STOPPED_MESSAGE, permanent=False,
                )

            await session.execute(
                update(IcpImportBatch)
                .where(IcpImportBatch.import_batch_id == import_batch_id)
                .values(
                    scoring_status="complete",
                    research_status="complete_with_warnings",
                    processing_completed_at=datetime.now(timezone.utc),
                    processing_warnings=[STOPPED_MESSAGE],
                )
            )
        await session.commit()

    return len(batch_ids)
