from datetime import datetime, timezone
from uuid import UUID

from fastapi import BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import IcpImportBatch, Workspace
from app.schemas.icp import ImportBatchOut
from app.schemas.job import JobItemOut, JobItemsOut, JobStatusOut, RetryFailedOut
from app.services import company_batch_status, excel_pipeline
from app.services.excel_pipeline import list_import_batches
from app.services.zoominfo_mapper import read_rows


async def _get_batch_in_workspace(db: AsyncSession, workspace_id: UUID, import_batch_id: UUID) -> IcpImportBatch:
    """Scopes the path's import_batch_id to workspace_id (require_workspace_member
    already scopes by workspace on the route, but a batch id from a DIFFERENT
    workspace must still 404, not leak another team's job)."""
    batch = (
        await db.execute(
            select(IcpImportBatch).where(
                IcpImportBatch.import_batch_id == import_batch_id,
                IcpImportBatch.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if batch is None:
        raise HTTPException(status_code=404, detail="import batch not found")
    return batch


async def _ingest_and_schedule(
    workspace_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession,
    files: list[UploadFile],
) -> ImportBatchOut:
    """Shared prospect-upload path (brief sections 4, 7, 8). Parses + upserts
    identity/contact data synchronously (fast), records the batch, and hands
    live Serper research + evidence scoring off to a background task scoped to
    just this upload's companies. Returns immediately with
    scoring_status='pending'; poll GET .../imports to see it flip to
    'complete' with real sales-status counts. No ICP anywhere in this flow."""
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    raw_rows: list[dict] = []
    for upload in files:
        content = await upload.read()
        raw_rows.extend(read_rows(upload.filename or "", content))

    zi_to_company_id = await excel_pipeline.run_pipeline(db, workspace.organisation_id, raw_rows)

    batch = await excel_pipeline.record_import_batch(
        db,
        workspace_id=workspace_id,
        file_names=[upload.filename or "" for upload in files],
        total_rows=len(raw_rows),
        zi_to_company_id=zi_to_company_id,
    )

    # Runs after this response is sent (own DB session). Scoped to this batch's
    # companies, resolved inside the task from import_batch_id.
    background_tasks.add_task(
        excel_pipeline.score_companies_in_background,
        workspace.organisation_id,
        workspace_id,
        batch.import_batch_id,
    )

    return ImportBatchOut.model_validate(batch)


async def upload_prospects(
    workspace_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    files: list[UploadFile] = File(...),
) -> ImportBatchOut:
    """Active prospect-data upload (brief section 7): no icp_id required."""
    return await _ingest_and_schedule(workspace_id, background_tasks, db, files)


async def import_history(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    """Every prospect upload in this workspace, newest first - the persisted
    audit trail behind Settings' Upload History table and Onboarding's
    Offering & Prospect Data step. No ICP (brief section 7)."""
    batches = await list_import_batches(db, workspace_id)
    return [ImportBatchOut.model_validate(batch) for batch in batches]


async def get_status(workspace_id: UUID, import_batch_id: UUID, db: AsyncSession = Depends(get_db)) -> JobStatusOut:
    """Live per-company rollup for one upload's job - polled by the frontend
    instead of keeping the upload request open (brief: no SSE yet, polling)."""
    await _get_batch_in_workspace(db, workspace_id, import_batch_id)
    data = await company_batch_status.compute_job_status(db, import_batch_id)
    return JobStatusOut(**data)


async def list_items(
    workspace_id: UUID,
    import_batch_id: UUID,
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> JobItemsOut:
    """Per-company status for one upload's job, so a failure can be inspected
    company-by-company (brief: "inspect the failure reason for each
    company")."""
    await _get_batch_in_workspace(db, workspace_id, import_batch_id)
    page_size = min(page_size, 200)
    rows, total = await company_batch_status.list_items(db, import_batch_id, page, page_size, status)
    items = [
        JobItemOut(
            company_id=row.company_id,
            company_name=company_name,
            status=row.status,
            error_message=row.error_message,
            retry_count=row.retry_count,
            started_at=row.started_at,
            completed_at=row.completed_at,
        )
        for row, company_name in rows
    ]
    return JobItemsOut(items=items, total=total, page=page, page_size=page_size)


async def retry_failed(
    workspace_id: UUID,
    import_batch_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RetryFailedOut:
    """Re-queues only the companies currently 'failed' (transient - Serper/
    LLM/scoring errors) in this batch, NOT 'needs_review' (permanent
    validation failures retrying can't fix) or already-completed companies."""
    await _get_batch_in_workspace(db, workspace_id, import_batch_id)
    failed_ids = await company_batch_status.failed_company_ids(db, import_batch_id)
    for company_id in failed_ids:
        await company_batch_status.reset_for_retry(db, company_id, import_batch_id)
    await db.commit()

    if failed_ids:
        workspace = await db.get(Workspace, workspace_id)
        background_tasks.add_task(
            excel_pipeline.retry_failed_companies_in_background,
            workspace.organisation_id,
            import_batch_id,
            failed_ids,
        )

    status_data = await company_batch_status.compute_job_status(db, import_batch_id)
    return RetryFailedOut(retried_count=len(failed_ids), status=JobStatusOut(**status_data))


async def cancel(workspace_id: UUID, import_batch_id: UUID, db: AsyncSession = Depends(get_db)) -> JobStatusOut:
    """Cooperative cancel (brief: "leave and reopen the page", "cancel a
    job") - the background task checks this before its next stage and stops
    picking up new work; already-completed companies keep their results."""
    await _get_batch_in_workspace(db, workspace_id, import_batch_id)
    await db.execute(
        update(IcpImportBatch)
        .where(IcpImportBatch.import_batch_id == import_batch_id, IcpImportBatch.cancel_requested_at.is_(None))
        .values(cancel_requested_at=datetime.now(timezone.utc))
    )
    await db.commit()
    data = await company_batch_status.compute_job_status(db, import_batch_id)
    return JobStatusOut(**data)
