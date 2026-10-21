from uuid import UUID

from fastapi import BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.industry_sectors import SECTOR_INDUSTRIES, SECTOR_ORDER, UNCLASSIFIED
from app.models import PERSONA_VALUES, Company, LeadScore, Workspace
from app.schemas.icp import (
    GenerateLeadsIn,
    IcpCompaniesOut,
    IcpCreate,
    IcpOptionsOut,
    IcpOut,
    IcpSavedCompanyOut,
    ImportBatchOut,
)
from app.services import excel_pipeline, lead_generation
from app.services.icp_service import (
    create_icp,
    criteria_fingerprint,
    delete_icp,
    get_icp,
    list_distinct_departments,
    list_icps,
    saved_company_count,
    saved_company_ids,
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


async def _out(db: AsyncSession, workspace_id: UUID, icp) -> IcpOut:
    """IcpOut plus the size of the ICP's saved company list (for its current
    criteria), so the card can show it after a page reload."""
    out = IcpOut.model_validate(icp)
    out.saved_company_count = await saved_company_count(db, workspace_id, icp)
    return out


async def create(workspace_id: UUID, payload: IcpCreate, db: AsyncSession = Depends(get_db)):
    return await _out(db, workspace_id, await create_icp(db, workspace_id, payload.model_dump()))


async def list_all(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return [await _out(db, workspace_id, icp) for icp in await list_icps(db, workspace_id)]


async def get_one(workspace_id: UUID, icp_id: UUID, db: AsyncSession = Depends(get_db)):
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")
    return await _out(db, workspace_id, icp)


async def update(
    workspace_id: UUID, icp_id: UUID, payload: IcpCreate, db: AsyncSession = Depends(get_db)
):
    # Full replace (PUT): the edit form always submits every field pre-filled
    # from the current ICP, so an unset field legitimately means "clear this
    # criterion", not "leave unchanged".
    icp = await update_icp(db, workspace_id, icp_id, payload.model_dump())
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")
    return await _out(db, workspace_id, icp)


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
) -> IcpCompaniesOut:
    """Returns the ICP's saved company list, discovering only what is missing.

    One ICP keeps ONE list per set of criteria (icp_service.criteria_fingerprint):
      - saved >= target: the saved list is returned as-is - no LLM, no search;
      - saved < target: only the missing (target - saved) companies are
        discovered, verified and added; saved ones come first;
      - criteria edited: the fingerprint changes, so the list starts fresh.

    New companies go into a generated batch that the existing research +
    scoring pipeline processes in the background, exactly like an upload
    (the frontend polls the SAME job endpoints via `new_batch`).

    The expensive half (LLM + one verification search per candidate) runs
    inline, because a batch must not be created until we know which
    companies are real.
    """
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    target = payload.target
    saved_ids = await saved_company_ids(db, workspace_id, icp)
    if len(saved_ids) >= target:
        print(f"[ICP] '{icp.name}': returning the saved list ({target} of {len(saved_ids)} saved) - no new search")
        return await _companies_out(db, icp, target, saved_ids[:target], reused=True, new_batch=None, warnings=[])

    missing = target - len(saved_ids)
    print(f"[ICP] '{icp.name}': {len(saved_ids)} saved, finding {missing} more to reach {target}")
    try:
        result = await lead_generation.generate_leads(
            db, workspace.organisation_id, workspace_id, icp, missing
        )
    except lead_generation.LeadGenerationError as exc:
        # Configuration problem (no LLM / no search), not a user error - 503
        # says "this can work later", which 400 would not.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not result.verified:
        if saved_ids:
            # The saved list still stands - return it rather than an error.
            warnings = [f"No more companies could be found for this ICP, so it stays at {len(saved_ids)}.", *result.warnings]
            return await _companies_out(db, icp, target, saved_ids, reused=True, new_batch=None, warnings=warnings)
        detail = "No new companies could be verified for this ICP."
        if result.warnings:
            detail = f"{detail} {' '.join(result.warnings)}"
        raise HTTPException(status_code=422, detail=detail)

    rows = lead_generation.to_company_rows(result.verified)
    zi_to_company_id = await excel_pipeline.run_pipeline(db, workspace.organisation_id, workspace_id, rows)

    batch = await excel_pipeline.record_import_batch(
        db,
        workspace_id=workspace_id,
        file_names=[f"Generated from {icp.name or 'ICP'}"],
        total_rows=len(rows),
        zi_to_company_id=zi_to_company_id,
        ingest_warnings=result.warnings or None,
        source="generated",
        icp_id=icp_id,
        criteria_hash=criteria_fingerprint(icp),
    )

    background_tasks.add_task(
        excel_pipeline.score_companies_in_background,
        workspace.organisation_id,
        workspace_id,
        batch.import_batch_id,
    )

    all_ids = await saved_company_ids(db, workspace_id, icp)
    return await _companies_out(
        db, icp, target, all_ids[:target], reused=False,
        new_batch=ImportBatchOut.model_validate(batch), warnings=result.warnings,
    )


async def _companies_out(db, icp, target, company_ids, *, reused, new_batch, warnings) -> IcpCompaniesOut:
    rows = (
        await db.execute(
            select(Company, LeadScore)
            .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
            .where(Company.company_id.in_(company_ids))
        )
    ).all() if company_ids else []
    by_id = {company.company_id: (company, score) for company, score in rows}
    companies = [
        IcpSavedCompanyOut(
            company_id=cid,
            company_name=by_id[cid][0].company_name,
            company_domain=by_id[cid][0].company_domain,
            lead_score=float(by_id[cid][1].lead_score) if by_id[cid][1] and by_id[cid][1].lead_score is not None else None,
            sales_status=by_id[cid][1].sales_status if by_id[cid][1] else None,
        )
        for cid in company_ids
        if cid in by_id
    ]
    return IcpCompaniesOut(
        icp_id=icp.icp_id,
        reused=reused,
        requested=target,
        total_saved=await saved_company_count(db, icp.workspace_id, icp),
        companies=companies,
        new_batch=new_batch,
        warnings=list(warnings or []),
    )
