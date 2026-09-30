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

import re
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.industry_sectors import SECTOR_INDUSTRIES
from app.models import DecisionMaker, IcpProfile, Organisation, Workspace

STARTER_ICP_NAME = "Starter ICP"

# Same list as the ICP form's country picker (frontend IcpPage.tsx
# COUNTRY_OPTIONS) - a starter country outside it couldn't be edited there.
STARTER_COUNTRIES: tuple[str, ...] = (
    "United States", "Canada", "United Kingdom", "Ireland", "Germany", "France",
    "Belgium", "Denmark", "Sweden", "Finland", "Russia", "Israel", "India",
    "Singapore", "Australia",
)
_COUNTRY_ALIASES: dict[str, tuple[str, ...]] = {
    "usa": ("United States",),
    "us": ("United States",),
    "u.s.": ("United States",),
    "u.s.a.": ("United States",),
    "uk": ("United Kingdom",),
    "england": ("United Kingdom",),
    "north america": ("United States", "Canada"),
}


def _starter_industries(industry: str | None) -> list[str] | None:
    """Map onboarding's free-text industry onto the ICP vocabulary
    (industry_sectors). None = no industry criterion (any industry)."""
    text = (industry or "").strip().lower()
    if not text:
        return None
    for sector, industries in SECTOR_INDUSTRIES.items():
        if text == sector.lower():
            return list(industries)
    all_industries = [i for industries in SECTOR_INDUSTRIES.values() for i in industries]
    exact = [i for i in all_industries if i.lower() == text]
    if exact:
        return exact
    # Whole-word containment either way ("SaaS Software" -> Software), never a
    # substring - "IT" must not match "Hospitality".
    if len(text) < 3:
        return None

    def contains_words(haystack: str, needle: str) -> bool:
        return re.search(rf"(?<![a-z]){re.escape(needle)}(?![a-z])", haystack) is not None

    partial = [
        i for i in all_industries if contains_words(text, i.lower()) or contains_words(i.lower(), text)
    ]
    return partial or None


def _starter_countries(headquarters: str | None) -> list[str] | None:
    """Countries named in the headquarters location, e.g. "San Francisco,
    California, USA" -> ["United States"]. None = any country."""
    text = (headquarters or "").strip().lower()
    if not text:
        return None
    found: list[str] = []

    def add(countries) -> None:
        found.extend(c for c in countries if c not in found)

    for country in STARTER_COUNTRIES:
        if re.search(rf"\b{re.escape(country.lower())}\b", text):
            add([country])
    for alias, countries in _COUNTRY_ALIASES.items():
        if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", text):
            add(countries)
    return found or None


def starter_icp_values(org: Organisation) -> dict:
    """A first, editable ICP built only from what onboarding collected -
    industry and headquarters. Criteria it can't infer stay unset (= any)."""
    return {
        "name": STARTER_ICP_NAME,
        "industries": _starter_industries(org.industry),
        "countries": _starter_countries(org.headquarters_location),
    }


async def create_starter_icp(session: AsyncSession, workspace_id: UUID, org: Organisation) -> IcpProfile:
    return await create_icp(session, workspace_id, starter_icp_values(org))


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
