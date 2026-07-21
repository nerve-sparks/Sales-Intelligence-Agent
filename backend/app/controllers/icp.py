from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.excel_pipeline import list_import_batches
from app.services.icp_filter import create_icp, filter_companies, get_icp, list_icps
from app.schemas.icp import IcpCompaniesOut, ImportBatchOut


class IcpCreate(BaseModel):
    name: str | None = None
    industries: list[str] | None = None
    employee_min: int | None = None
    employee_max: int | None = None
    revenue_min_usd: int | None = None
    revenue_max_usd: int | None = None
    countries: list[str] | None = None
    technologies: list[str] | None = None
    buying_committee_personas: list[str] | None = None
    departments: list[str] | None = None


async def create(workspace_id: UUID, payload: IcpCreate, db: AsyncSession = Depends(get_db)):
    return await create_icp(db, workspace_id, payload.model_dump())


async def list_all(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return await list_icps(db, workspace_id)


async def import_history(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    rows = await list_import_batches(db, workspace_id)
    return [
        ImportBatchOut.model_validate(batch).model_copy(update={"icp_name": icp_name})
        for batch, icp_name in rows
    ]


async def companies(workspace_id: UUID, icp_id: UUID, db: AsyncSession = Depends(get_db)):
    icp = await get_icp(db, workspace_id, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    matches = await filter_companies(db, icp)
    return IcpCompaniesOut(icp=icp, match_count=len(matches), companies=matches)
