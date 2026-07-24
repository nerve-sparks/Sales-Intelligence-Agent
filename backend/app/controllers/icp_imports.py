from uuid import UUID

from fastapi import BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Workspace
from app.services import excel_pipeline
from app.services.icp_filter import get_icp
from app.services.zoominfo_mapper import read_rows
from app.schemas.icp import ImportBatchOut

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def upload_excel(
    workspace_id: UUID,
    icp_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    files: list[UploadFile] = File(...),
) -> ImportBatchOut:
    """Ingests + extracts signals synchronously (fast), then hands scoring
    off to a background task and returns immediately - scoring hundreds of
    companies (each potentially an LLM call) used to make this request hang
    until every company was scored. The returned batch has
    scoring_status='pending'; poll GET .../imports (Settings' upload history,
    which the Enterprise List's per-upload filter also reads) to see it flip
    to 'complete' with real active/nurture counts. The previous behaviour -
    returning a scored .xlsx to download - is gone; use the Enterprise
    List's Export button once scoring has caught up instead, since a
    "scored" file can't exist before scoring has actually run."""
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    # All files are parsed and concatenated before the pipeline runs once -
    # upsert_rows/extract_signals are organisation-scoped full scans, so
    # running the pipeline per-file would redo that scan once per file
    # instead of once per upload batch. Cross-file duplicate companies/
    # contacts are already handled safely by the existing ON CONFLICT
    # upserts in excel_pipeline.upsert_rows.
    raw_rows: list[dict] = []
    for upload in files:
        content = await upload.read()
        raw_rows.extend(read_rows(upload.filename or "", content))

    zi_to_company_id, signal_result, matching_ids = await excel_pipeline.run_pipeline(
        db, workspace.organisation_id, raw_rows, icp
    )

    batch = await excel_pipeline.record_import_batch(
        db,
        icp_id=icp_id,
        file_names=[upload.filename or "" for upload in files],
        total_rows=len(raw_rows),
        zi_to_company_id=zi_to_company_id,
        signal_result=signal_result,
        matching_ids=matching_ids,
    )

    # Runs after this response has been sent (own DB session - the request's
    # session, `db`, is closed by then).
    background_tasks.add_task(
        excel_pipeline.score_companies_in_background,
        workspace.organisation_id,
        icp_id,
        batch.import_batch_id,
    )

    return ImportBatchOut.model_validate(batch).model_copy(update={"icp_name": icp.name})
