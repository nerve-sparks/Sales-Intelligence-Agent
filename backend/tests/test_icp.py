"""ICP definitions - CRUD, workspace isolation, and the guarantees that keep
an ICP a *seed for discovery* rather than a filter on scoring.

Runs against the real Postgres DB via the shared org_ctx fixture, same as the
rest of this suite.
"""

import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.core.db import async_session_maker
from app.models import DecisionMaker, IcpImportBatch, IcpProfile
from app.schemas.icp import IcpCreate
from app.services.icp_service import (
    create_icp,
    delete_icp,
    get_icp,
    list_distinct_departments,
    list_icps,
    update_icp,
)

FULL_CRITERIA = dict(
    name="Mid-market US software",
    industries=["Software", "Media & Internet"],
    employee_min=201,
    employee_max=500,
    revenue_min_usd=50_000_000,
    revenue_max_usd=100_000_000,
    countries=["United States"],
    technologies=["Snowflake"],
    buying_committee_personas=["ceo", "cto"],
    departments=["C-Suite"],
)


async def test_create_round_trips_every_criterion(org_ctx):
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, dict(FULL_CRITERIA))

        assert icp.workspace_id == workspace_id
        for field, expected in FULL_CRITERIA.items():
            assert getattr(icp, field) == expected, field


async def test_create_with_no_criteria_is_allowed(org_ctx):
    """An ICP with nothing set is legitimate - it constrains nothing, which is
    the documented meaning of an unset field, not an invalid state."""
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, IcpCreate().model_dump())

        assert icp.icp_id is not None
        assert icp.industries is None
        assert icp.employee_min is None


async def test_list_is_scoped_to_its_workspace_and_newest_first(org_ctx):
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        first = await create_icp(session, workspace_id, {"name": "first"})
        second = await create_icp(session, workspace_id, {"name": "second"})

        rows = await list_icps(session, workspace_id)
        assert [r.icp_id for r in rows] == [second.icp_id, first.icp_id]

        # A different workspace sees none of them.
        assert await list_icps(session, uuid.uuid4()) == []


async def test_get_and_update_reject_another_workspaces_icp(org_ctx):
    """Guessing a valid icp_id from outside its workspace must not grant
    read or write access - the workspace_id filter is the isolation boundary,
    not just a lookup convenience."""
    _org_id, workspace_id = org_ctx
    other_workspace = uuid.uuid4()
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "private"})

        assert await get_icp(session, other_workspace, icp.icp_id) is None
        assert await update_icp(session, other_workspace, icp.icp_id, {"name": "hijacked"}) is None
        assert await delete_icp(session, other_workspace, icp.icp_id) is False

        # ...and the row is untouched.
        still_there = await get_icp(session, workspace_id, icp.icp_id)
        assert still_there is not None and still_there.name == "private"


async def test_update_is_a_full_replace(org_ctx):
    """PUT semantics: the edit form submits every field, so a field left unset
    means "clear this criterion", not "leave it unchanged"."""
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, dict(FULL_CRITERIA))

        cleared = IcpCreate(name="Now unconstrained").model_dump()
        updated = await update_icp(session, workspace_id, icp.icp_id, cleared)

        assert updated.name == "Now unconstrained"
        assert updated.industries is None
        assert updated.employee_min is None
        assert updated.buying_committee_personas is None


async def test_update_and_delete_return_none_for_a_missing_icp(org_ctx):
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        assert await update_icp(session, workspace_id, uuid.uuid4(), {"name": "x"}) is None
        assert await delete_icp(session, workspace_id, uuid.uuid4()) is False


async def test_delete_is_idempotent(org_ctx):
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "temp"})

        assert await delete_icp(session, workspace_id, icp.icp_id) is True
        assert await delete_icp(session, workspace_id, icp.icp_id) is False
        assert await get_icp(session, workspace_id, icp.icp_id) is None


async def test_deleting_an_icp_keeps_its_upload_history(org_ctx):
    """icp_import_batch.icp_id is ON DELETE SET NULL. Deleting an ICP must
    never destroy the record of real companies that were ingested - the batch
    survives with its link cleared."""
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, {"name": "with history"})
        batch = IcpImportBatch(
            icp_id=icp.icp_id,
            workspace_id=workspace_id,
            file_names=["prospects.xlsx"],
            files_processed=1,
            total_rows=10,
            companies_ingested=10,
            signals_extracted=3,
            matched_icp_count=0,
            active_count=0,
            nurture_count=0,
        )
        session.add(batch)
        await session.commit()
        batch_id = batch.import_batch_id

        await delete_icp(session, workspace_id, icp.icp_id)

        session.expire_all()
        surviving = (
            await session.execute(
                select(IcpImportBatch).where(IcpImportBatch.import_batch_id == batch_id)
            )
        ).scalar_one_or_none()

        assert surviving is not None, "upload history must outlive the ICP"
        assert surviving.icp_id is None
        assert surviving.companies_ingested == 10


async def test_departments_come_from_real_contacts_ranked_by_frequency(org_ctx, make_company):
    """The department picker is data-driven precisely because ZoomInfo's labels
    ("C-Suite", "Information Technology") are not guessable - an earlier
    hardcoded list offered values that matched no row."""
    organisation_id, workspace_id = org_ctx
    company = await make_company()

    async with async_session_maker() as session:
        for index, department in enumerate(["Sales", "C-Suite", "C-Suite", "C-Suite", "Sales", None]):
            session.add(
                DecisionMaker(
                    organisation_id=organisation_id,
                    company_id=company.company_id,
                    zi_person_id=uuid.uuid4().int % 1_000_000_000 + index,
                    department=department,
                )
            )
        await session.commit()

        departments = await list_distinct_departments(session, workspace_id)

    # Most common first; the NULL department is not offered as an option.
    assert departments == ["C-Suite", "Sales"]


async def test_departments_are_empty_before_any_upload(org_ctx):
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        assert await list_distinct_departments(session, workspace_id) == []


async def test_departments_for_an_unknown_workspace_is_empty(org_ctx):
    async with async_session_maker() as session:
        assert await list_distinct_departments(session, uuid.uuid4()) == []


@pytest.mark.parametrize(
    "payload",
    [
        {"employee_min": 500, "employee_max": 50},
        {"revenue_min_usd": 10_000_000, "revenue_max_usd": 1_000_000},
    ],
)
def test_reversed_ranges_are_rejected(payload):
    """A reversed range can never match anything, and would read to a user as
    "no such companies exist" rather than "this ICP is impossible"."""
    with pytest.raises(ValidationError):
        IcpCreate(**payload)


def test_equal_min_and_max_is_a_valid_range():
    icp = IcpCreate(employee_min=100, employee_max=100)
    assert icp.employee_min == icp.employee_max == 100


def test_fit_mode_is_not_a_settable_field():
    """fit_mode encoded the old strict/flexible ICP-fit band from the removed
    gate/D1-D7 scorer. The current product scores on evidence alone, so the
    API must not accept it - see ICP_LEAD_GENERATION_INTENT.md."""
    assert "fit_mode" not in IcpCreate.model_fields
    assert "fit_mode" not in IcpCreate(**{"fit_mode": "strict"}).model_dump()


async def test_stored_icp_keeps_the_database_default_fit_mode(org_ctx):
    """The column is NOT NULL with a server default, so rows still populate it
    even though the API never sets it - it is simply inert."""
    _org_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        icp = await create_icp(session, workspace_id, IcpCreate(name="x").model_dump())
        stored = (
            await session.execute(select(IcpProfile).where(IcpProfile.icp_id == icp.icp_id))
        ).scalar_one()

        assert stored.fit_mode == "flexible"
