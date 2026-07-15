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
    file: UploadFile = File(...),
):
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    content = await file.read()
    raw_rows = read_rows(file.filename or "", content)

    zi_to_company_id = await excel_pipeline.run_pipeline(db, workspace.organisation_id, raw_rows)
    matching_ids = await excel_pipeline.matching_company_ids(db, icp)
    scores = await excel_pipeline.scores_for_companies(db, list(zi_to_company_id.values()))

    workbook_bytes = excel_pipeline.build_scored_workbook(raw_rows, zi_to_company_id, scores, matching_ids)

    filename = f"scored_{icp.name or 'results'}.xlsx".replace(" ", "_")
    return Response(
        content=workbook_bytes,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
