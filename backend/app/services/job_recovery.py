"""Crash-recovery for prospect-upload jobs (brief: "continue processing if
the user closes the browser" / durability across restarts).

score_companies_in_background runs as an in-process asyncio task kicked off
by FastAPI's BackgroundTasks - if the app process stops (crash, deploy,
`--reload`) while a job is mid-flight, that task is gone with it, and
IcpImportBatch.research_status is left at 'pending' forever with no
in-memory work left to finish it. On startup, resume_interrupted_jobs()
finds every such job and restarts its background processing from scratch
(the pipeline is idempotent per company - see company_batch_status.py/
buying_event_service.persist_company_events - so re-running is safe, not
duplicate work: already-researched companies within the refresh window are
skipped, already-scored companies are just re-scored to the same values).
"""

import asyncio
import logging

from sqlalchemy import select

from app.core.db import async_session_maker
from app.models import IcpImportBatch, Workspace
from app.services import excel_pipeline

logger = logging.getLogger(__name__)

# asyncio.create_task() doesn't keep its own strong reference - without this,
# the task can be garbage-collected mid-run since nothing else holds it
# (there's no request/response cycle here to anchor it to, unlike
# BackgroundTasks). Discarded via the done-callback once each job finishes.
_background_jobs: set[asyncio.Task] = set()


async def resume_interrupted_jobs() -> int:
    async with async_session_maker() as session:
        rows = (
            await session.execute(
                select(IcpImportBatch.import_batch_id, IcpImportBatch.workspace_id, Workspace.organisation_id)
                .join(Workspace, Workspace.workspace_id == IcpImportBatch.workspace_id)
                .where(IcpImportBatch.research_status == "pending")
            )
        ).all()

    for import_batch_id, workspace_id, organisation_id in rows:
        logger.info(
            "resuming interrupted job",
            extra={"job_id": str(import_batch_id), "stage": "job"},
        )
        # Fire-and-forget, same as a request-scoped BackgroundTasks.add_task -
        # there's no request to attach to at startup, so this is scheduled
        # directly on the running event loop instead.
        task = asyncio.create_task(
            excel_pipeline.score_companies_in_background(organisation_id, workspace_id, import_batch_id)
        )
        _background_jobs.add(task)
        task.add_done_callback(_background_jobs.discard)

    return len(rows)
