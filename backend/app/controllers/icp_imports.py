from uuid import UUID

from fastapi import Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Workspace
from app.services import excel_pipeline
from app.services.icp_filter import get_icp
from app.services.zoominfo_mapper import read_rows

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def upload_excel(
    workspace_id: UUID,
    icp_id: UUID,
    db: AsyncSession = Depends(get_db),
    files: list[UploadFile] = File(...),
):
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    # All files are parsed and concatenated before the pipeline runs once -
    # upsert_rows/extract_signals/run_scoring are all organisation-scoped
    # full scans, so running the pipeline per-file would redo that scan
    # once per file instead of once per upload batch. Cross-file duplicate
    # companies/contacts are already handled safely by the existing
    # ON CONFLICT upserts in excel_pipeline.upsert_rows.
    raw_rows: list[dict] = []
    for upload in files:
        content = await upload.read()
        raw_rows.extend(read_rows(upload.filename or "", content))

    zi_to_company_id, signal_result, score_result = await excel_pipeline.run_pipeline(
        db, workspace.organisation_id, raw_rows
    )
    matching_ids = await excel_pipeline.matching_company_ids(db, icp)
    scores = await excel_pipeline.scores_for_companies(db, list(zi_to_company_id.values()))

    workbook_bytes = excel_pipeline.build_scored_workbook(raw_rows, zi_to_company_id, scores, matching_ids)

    filename = f"scored_{icp.name or 'results'}.xlsx".replace(" ", "_")
    # The response body has to stay the binary workbook - real pipeline
    # counts go in headers so the frontend (Business Discovery step) can
    # show what actually happened without parsing the download itself.
    return Response(
        content=workbook_bytes,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Files-Processed": str(len(files)),
            "X-Total-Rows": str(len(raw_rows)),
            "X-Companies-Ingested": str(len(zi_to_company_id)),
            "X-Signals-Extracted": str(signal_result["inserted"]),
            "X-Matched-Icp": str(len(matching_ids)),
            "X-Active-Count": str(score_result["active"]),
            "X-Nurture-Count": str(score_result["nurture"]),
        },
    )
