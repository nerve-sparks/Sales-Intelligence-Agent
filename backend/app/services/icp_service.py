"""ICP persistence - workspace-scoped CRUD over icp_profile.

Restored from the pre-2ba62a9 services/icp_filter.py, minus filter_companies()
and get_icp_by_organisation(). That omission is the point of the module rename:
the old ICP was a *filter* that decided which companies were allowed to score
(via fit_mode and a "D6 ICP-fit" band in the removed gate/D1-D7 scorer). The
current product scores every company on real evidence, and an ICP is a seed
for *discovery* instead - it decides which companies get found, and has no
term in the Lead Score. Re-adding a "companies matching this ICP" query here
would reintroduce the design the pipeline deliberately moved away from; see
ICP_LEAD_GENERATION_INTENT.md and evidence_scorer.py.
"""

import hashlib
import json
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, CompanyImportBatch, DecisionMaker, IcpImportBatch, IcpProfile, Workspace

# The ICP fields that drive company discovery (the same set
# lead_generation._icp_summary puts in the prompt). `name` is deliberately
# absent: renaming an ICP doesn't change which companies fit it.
_CRITERIA_LIST_FIELDS = ("industries", "countries", "technologies", "departments", "buying_committee_personas")
_CRITERIA_NUMBER_FIELDS = ("employee_min", "employee_max", "revenue_min_usd", "revenue_max_usd")


def criteria_fingerprint(icp: IcpProfile) -> str:
    """Stable hash of the ICP's discovery criteria - ignores list order, case
    and stray whitespace, so only a real criteria change produces a new one."""
    data = {
        field: sorted({str(v).strip().lower() for v in (getattr(icp, field) or []) if str(v).strip()})
        for field in _CRITERIA_LIST_FIELDS
    }
    for field in _CRITERIA_NUMBER_FIELDS:
        data[field] = getattr(icp, field)
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def _saved_list_stmt(workspace_id: UUID, icp: IcpProfile):
    """Membership rows of the ICP's saved list: companies from its generated
    batches whose criteria match the ICP as it is NOW."""
    return (
        select(CompanyImportBatch.company_id, func.min(CompanyImportBatch.created_at).label("first_saved"))
        .join(IcpImportBatch, IcpImportBatch.import_batch_id == CompanyImportBatch.import_batch_id)
        .join(Company, Company.company_id == CompanyImportBatch.company_id)
        .where(
            IcpImportBatch.icp_id == icp.icp_id,
            IcpImportBatch.source == "generated",
            IcpImportBatch.criteria_hash == criteria_fingerprint(icp),
            Company.workspace_id == workspace_id,
        )
        .group_by(CompanyImportBatch.company_id)
    )


async def saved_company_ids(session: AsyncSession, workspace_id: UUID, icp: IcpProfile) -> list[UUID]:
    """The ICP's saved company list, in the order the companies were first
    found (then by name, for a stable order within one run)."""
    saved = _saved_list_stmt(workspace_id, icp).subquery()
    stmt = (
        select(saved.c.company_id)
        .join(Company, Company.company_id == saved.c.company_id)
        .order_by(saved.c.first_saved, Company.company_name)
    )
    return list((await session.execute(stmt)).scalars().all())


async def saved_company_count(session: AsyncSession, workspace_id: UUID, icp: IcpProfile) -> int:
    saved = _saved_list_stmt(workspace_id, icp).subquery()
    return (await session.execute(select(func.count()).select_from(saved))).scalar_one()


async def create_icp(session: AsyncSession, workspace_id: UUID, values: dict) -> IcpProfile:
    icp = IcpProfile(workspace_id=workspace_id, **values)
    session.add(icp)
    await session.commit()
    await session.refresh(icp)
    return icp


async def get_icp(session: AsyncSession, workspace_id: UUID, icp_id: UUID) -> IcpProfile | None:
    stmt = select(IcpProfile).where(
        IcpProfile.icp_id == icp_id, IcpProfile.workspace_id == workspace_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_icp(
    session: AsyncSession, workspace_id: UUID, icp_id: UUID, values: dict
) -> IcpProfile | None:
    """Full-replace update, scoped by workspace_id so a member of one
    workspace can never edit another workspace's ICP even by guessing its id
    (the get_icp lookup already filters on workspace_id). Returns None when
    there's no such ICP in this workspace - the controller turns that into a
    404."""
    icp = await get_icp(session, workspace_id, icp_id)
    if icp is None:
        return None
    for key, value in values.items():
        setattr(icp, key, value)
    # A user edit makes a Starter ICP theirs - never re-fill it after this
    # (see services/starter_icp.py).
    icp.auto_generated = False
    icp.updated_at = func.now()
    await session.commit()
    await session.refresh(icp)
    return icp


async def delete_icp(session: AsyncSession, workspace_id: UUID, icp_id: UUID) -> bool:
    """Deletes one ICP (workspace-scoped, same isolation as update_icp).

    icp_import_batch.icp_id is ON DELETE SET NULL, so upload history survives
    with its ICP link cleared rather than being destroyed - deleting an ICP
    must never take a record of real ingested companies with it. Companies,
    buying events and scores are organisation-scoped and untouched either way.
    Returns False when there's nothing to delete.
    """
    icp = await get_icp(session, workspace_id, icp_id)
    if icp is None:
        return False
    await session.delete(icp)
    await session.commit()
    return True


async def list_distinct_departments(session: AsyncSession, workspace_id: UUID) -> list[str]:
    """Every department label actually present on this organisation's
    contacts, most common first. Empty for a workspace whose org has not
    uploaded anyone yet - the form falls back to free text in that case
    rather than showing invented options.

    Scoped through Workspace to the organisation because DecisionMaker is
    workspace-scoped (migration a3f8d21c6b94).
    """
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        return []

    stmt = (
        select(DecisionMaker.department)
        .where(
            DecisionMaker.workspace_id == workspace_id,
            DecisionMaker.department.isnot(None),
            DecisionMaker.department != "",
        )
        .group_by(DecisionMaker.department)
        .order_by(func.count().desc())
    )
    return [row[0] for row in (await session.execute(stmt)).all()]


async def list_icps(session: AsyncSession, workspace_id: UUID) -> list[IcpProfile]:
    stmt = (
        select(IcpProfile)
        .where(IcpProfile.workspace_id == workspace_id)
        .order_by(IcpProfile.created_at.desc())
    )
    return list((await session.execute(stmt)).scalars().all())
