from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.icp_filter import create_icp, filter_companies, get_icp
from app.views.icp_view import serialize_company, serialize_icp


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


async def create(payload: IcpCreate, db: AsyncSession = Depends(get_db)):
    icp = await create_icp(db, payload.model_dump())
    return serialize_icp(icp)


async def companies(icp_id: UUID, db: AsyncSession = Depends(get_db)):
    icp = await get_icp(db, icp_id)
    if icp is None:
        raise HTTPException(status_code=404, detail="icp not found")

    matches = await filter_companies(db, icp)
    return {
        "icp": serialize_icp(icp),
        "match_count": len(matches),
        "companies": [serialize_company(c) for c in matches],
    }
