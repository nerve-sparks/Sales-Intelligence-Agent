from uuid import UUID

from fastapi import BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.industry_sectors import SECTOR_INDUSTRIES, SECTOR_ORDER, UNCLASSIFIED
from app.models import PERSONA_VALUES, Workspace
from app.schemas.icp import GenerateLeadsIn, IcpCreate, IcpOptionsOut, ImportBatchOut
from app.services import excel_pipeline, lead_generation
from app.services.icp_service import (
    create_icp,
    delete_icp,
    get_icp,
    list_distinct_departments,
    list_icps,
    update_icp,
)


async def options(workspace_id: UUID, db: AsyncSession = Depends(get_db)) -> IcpOptionsOut:
    """Picker vocabulary for the ICP form. Industries/personas are fixed
    vocabularies owned by the backend; departments are read from the org's
    real contacts, because ZoomInfo's department labels ("C-Suite",
    "Information Technology", "Engineering & Technical") are not something a
    hardcoded list guesses correctly - an earlier form offered
    "Customer Success"/"Product", which match no row in the data."""
    sectors = {
        sector: list(SECTOR_INDUSTRIES[sector])
        for sector in SECTOR_ORDER
        if sector != UNCLASSIFIED
    }
    industries = sorted({industry for values in sectors.values() for industry in values})
    return IcpOptionsOut(
        industries=industries,
        sectors=sectors,
        personas=list(PERSONA_VALUES),
        departments=await list_distinct_departments(db, workspace_id),
    )


async def create(workspace_id: UUID, payload: IcpCreate, db: AsyncSession = Depends(get_db)):
    return await create_icp(db, workspace_id, payload.model_dump())


async def list_all(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return await list_icps(db, workspace_id)


async def get_one(workspace_id: UUID, icp_id: UUID, db: AsyncSession = Depends(get_db)):
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")
    return icp


async def update(
    workspace_id: UUID, icp_id: UUID, payload: IcpCreate, db: AsyncSession = Depends(get_db)
):
    # Full replace (PUT): the edit form always submits every field pre-filled
    # from the current ICP, so an unset field legitimately means "clear this
    # criterion", not "leave unchanged".
    icp = await update_icp(db, workspace_id, icp_id, payload.model_dump())
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")
    return icp


async def delete(workspace_id: UUID, icp_id: UUID, db: AsyncSession = Depends(get_db)):
    deleted = await delete_icp(db, workspace_id, icp_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="icp not found")
    return Response(status_code=204)


async def generate(
    workspace_id: UUID,
    icp_id: UUID,
    payload: GenerateLeadsIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> ImportBatchOut:
    """Discovers new companies from an ICP and hands them to the existing
    research + scoring pipeline.

    Returns as soon as the verified companies exist, with
    scoring_status='pending' - exactly like an upload. The frontend then polls
    the SAME job endpoints (GET .../imports/{id}, .../items, retry-failed,
    cancel); generation deliberately adds no job-tracking API of its own.

    The expensive, unreliable half (LLM + one verification search per
    candidate) runs inline rather than in the background, because a batch must
    not be created until we know which companies are real - an empty or
    hallucinated batch would be worse than a slow response.
    """
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    try:
        result = await lead_generation.generate_leads(
            db, workspace.organisation_id, icp, payload.target
        )
    except lead_generation.LeadGenerationError as exc:
        # Configuration problem (no LLM / no search), not a user error - 503
        # says "this can work later", which 400 would not.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not result.verified:
        detail = "No new companies could be verified for this ICP."
        if result.warnings:
            detail = f"{detail} {' '.join(result.warnings)}"
        raise HTTPException(status_code=422, detail=detail)

    rows = lead_generation.to_company_rows(result.verified, workspace.organisation_id)
    zi_to_company_id = await excel_pipeline.run_pipeline(db, workspace.organisation_id, rows)

    batch = await excel_pipeline.record_import_batch(
        db,
        workspace_id=workspace_id,
        file_names=[f"Generated from {icp.name or 'ICP'}"],
        total_rows=len(rows),
        zi_to_company_id=zi_to_company_id,
        ingest_warnings=result.warnings or None,
        source="generated",
        icp_id=icp_id,
    )

    background_tasks.add_task(
        excel_pipeline.score_companies_in_background,
        workspace.organisation_id,
        workspace_id,
        batch.import_batch_id,
    )

    return ImportBatchOut.model_validate(batch)
