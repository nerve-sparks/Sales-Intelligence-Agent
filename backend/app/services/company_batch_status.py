"""Per-company processing-status writes on company_import_batch - added so a
specific upload's job can be inspected/retried company-by-company
(GET .../imports/{id}/items, POST .../retry-failed) instead of only ever
seeing the batch-wide aggregate counts on icp_import_batch.

Deliberately separate from the actual research/scoring logic in
search_signal_ingest.py/evidence_scorer.py - those pipeline modules stay
focused on doing the work; this module just stamps where a company is. Every
function takes import_batch_id as `UUID | None` and is a no-op when it's
None, so a caller running outside any specific upload's job (e.g. an
org-wide re-score not tied to one batch) costs nothing extra.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, CompanyImportBatch, IcpImportBatch

# Mirrors CompanyImportBatch's status CHECK constraint - queued/researching/
# scoring/completed/retrying/failed/needs_review. No decision-maker-lookup or
# email-generation stage: neither exists in this pipeline.
TERMINAL_STATUSES = ("completed", "failed", "needs_review")


async def mark_stage(
    session: AsyncSession,
    company_id: UUID,
    import_batch_id: UUID | None,
    status: str,
    *,
    stamp_started: bool = False,
) -> None:
    """Advances a company to a non-terminal stage (researching/scoring/
    retrying). Use mark_completed/mark_failed for the terminal states so
    completed_at is always set consistently."""
    if import_batch_id is None:
        return
    values: dict = {"status": status}
    if stamp_started:
        values["started_at"] = datetime.now(timezone.utc)
    await session.execute(
        update(CompanyImportBatch)
        .where(
            CompanyImportBatch.company_id == company_id,
            CompanyImportBatch.import_batch_id == import_batch_id,
        )
        .values(**values)
    )


async def mark_bulk_stage(
    session: AsyncSession, company_ids: list[UUID], import_batch_id: UUID | None, status: str, *, stamp_started: bool = False,
) -> None:
    """Same as mark_stage but for many companies in one UPDATE - used to
    stamp an entire batch's scope into a stage up front (e.g. 'researching'
    at the start of a research pass) instead of one query per company."""
    if import_batch_id is None or not company_ids:
        return
    values: dict = {"status": status}
    if stamp_started:
        values["started_at"] = datetime.now(timezone.utc)
    await session.execute(
        update(CompanyImportBatch)
        .where(
            CompanyImportBatch.company_id.in_(company_ids),
            CompanyImportBatch.import_batch_id == import_batch_id,
        )
        .values(**values)
    )


async def mark_completed(session: AsyncSession, company_id: UUID, import_batch_id: UUID | None) -> None:
    """Only flips a company to 'completed' from 'scoring' - a company already
    marked 'failed'/'needs_review' this run keeps that status even though
    scoring still runs for it (every company is scored regardless of
    research outcome), so the real issue stays visible to the user instead
    of being silently overwritten by the next stage succeeding."""
    if import_batch_id is None:
        return
    await session.execute(
        update(CompanyImportBatch)
        .where(
            CompanyImportBatch.company_id == company_id,
            CompanyImportBatch.import_batch_id == import_batch_id,
            CompanyImportBatch.status == "scoring",
        )
        .values(status="completed", completed_at=datetime.now(timezone.utc), error_message=None)
    )


async def mark_failed(
    session: AsyncSession,
    company_id: UUID,
    import_batch_id: UUID | None,
    error_message: str,
    *,
    permanent: bool = False,
) -> None:
    """permanent=True (e.g. no domain to research at all) lands on
    'needs_review' and is excluded from retry-failed; permanent=False
    ('failed', a transient Serper/LLM/scoring error) is retryable."""
    if import_batch_id is None:
        return
    await session.execute(
        update(CompanyImportBatch)
        .where(
            CompanyImportBatch.company_id == company_id,
            CompanyImportBatch.import_batch_id == import_batch_id,
        )
        .values(
            status="needs_review" if permanent else "failed",
            error_message=error_message[:2000],
            is_permanent_failure=permanent,
            completed_at=datetime.now(timezone.utc),
        )
    )


async def reset_for_retry(session: AsyncSession, company_id: UUID, import_batch_id: UUID) -> None:
    """POST .../retry-failed re-queues a company: back to 'queued', error
    cleared, retry_count incremented, timestamps reset for the new attempt."""
    await session.execute(
        update(CompanyImportBatch)
        .where(
            CompanyImportBatch.company_id == company_id,
            CompanyImportBatch.import_batch_id == import_batch_id,
        )
        .values(
            status="queued",
            error_message=None,
            retry_count=CompanyImportBatch.retry_count + 1,
            started_at=None,
            completed_at=None,
        )
    )


# --------------------------------------------------------------------------
# Read side: job/item status for GET .../imports/{id} and .../items
# --------------------------------------------------------------------------

PROCESSING_STATUSES = ("researching", "scoring", "retrying")


async def status_counts(session: AsyncSession, import_batch_id: UUID) -> dict[str, int]:
    rows = (
        await session.execute(
            select(CompanyImportBatch.status, func.count())
            .where(CompanyImportBatch.import_batch_id == import_batch_id)
            .group_by(CompanyImportBatch.status)
        )
    ).all()
    by_status = {status: count for status, count in rows}
    total = sum(by_status.values())
    return {
        "total": total,
        "queued": by_status.get("queued", 0),
        "processing": sum(by_status.get(s, 0) for s in PROCESSING_STATUSES),
        "completed": by_status.get("completed", 0),
        "failed": by_status.get("failed", 0),
        "needs_review": by_status.get("needs_review", 0),
    }


async def compute_job_status(session: AsyncSession, import_batch_id: UUID) -> dict:
    """Job-level status (queued/processing/partially_completed/completed/
    failed/cancelled), computed fresh from the current per-company tally plus
    icp_import_batch's cancel flag and terminal research_status - never
    stored, so it can't drift out of sync with the real per-company state."""
    counts = await status_counts(session, import_batch_id)
    batch = await session.get(IcpImportBatch, import_batch_id)

    total = counts["total"]
    progress = round((counts["completed"] / total) * 100, 1) if total else 0.0
    still_incomplete = bool(counts["queued"] or counts["processing"])

    if batch is not None and batch.cancel_requested_at is not None:
        # Cancellation requested - report it immediately rather than waiting
        # for the background task to next check the flag (which may not
        # happen for a while if a stage is already in flight). The one
        # exception: the job had already finished everything before the
        # cancel was requested, in which case there's nothing to cancel.
        if still_incomplete or batch.research_status == "pending":
            status = "cancelled"
        elif counts["failed"] or counts["needs_review"]:
            status = "partially_completed"
        else:
            status = "completed"
    elif batch is not None and batch.research_status == "failed":
        status = "failed"
    elif batch is None or batch.research_status == "pending":
        status = "processing" if counts["completed"] or counts["failed"] or counts["needs_review"] else "queued"
    elif counts["failed"] or counts["needs_review"]:
        status = "partially_completed"
    else:
        status = "completed"

    return {
        "job_id": import_batch_id,
        "status": status,
        "total": total,
        "queued": counts["queued"],
        "processing": counts["processing"],
        "completed": counts["completed"],
        "failed": counts["failed"],
        "needs_review": counts["needs_review"],
        "progress_percentage": progress,
    }


async def list_items(
    session: AsyncSession, import_batch_id: UUID, page: int, page_size: int, status: str | None = None,
):
    stmt = (
        select(CompanyImportBatch, Company.company_name)
        .join(Company, Company.company_id == CompanyImportBatch.company_id)
        .where(CompanyImportBatch.import_batch_id == import_batch_id)
    )
    if status is not None:
        stmt = stmt.where(CompanyImportBatch.status == status)

    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = (
        stmt.order_by(Company.company_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()
    return rows, total


async def failed_company_ids(session: AsyncSession, import_batch_id: UUID) -> list[UUID]:
    """Companies eligible for POST .../retry-failed - 'failed' (transient)
    only, never 'needs_review' (permanent - retrying can't fix a missing
    domain)."""
    return list(
        (
            await session.execute(
                select(CompanyImportBatch.company_id).where(
                    CompanyImportBatch.import_batch_id == import_batch_id,
                    CompanyImportBatch.status == "failed",
                )
            )
        ).scalars().all()
    )
