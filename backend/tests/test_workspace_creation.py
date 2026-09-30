"""Creating an additional workspace (Settings' "+ New Workspace") - the
creator must become a member of it, and it must start with no ICP profiles
of its own rather than seeing another workspace's.

Runs against the real Postgres DB via the shared org_ctx fixture.
"""

import uuid

import pytest
from sqlalchemy import select

from app.controllers import workspaces as workspaces_controller
from app.core.auth import VerifiedAuthUser, require_workspace_member
from app.core.db import async_session_maker
from app.models import Organisation, WorkspaceMember
from app.services import user_service, workspace_service
from app.services.icp_service import (
    STARTER_ICP_NAME,
    _starter_countries,
    _starter_industries,
    create_icp,
    list_icps,
)


async def _make_owner(organisation_id, workspace_id) -> VerifiedAuthUser:
    uid = f"pytest-uid-{uuid.uuid4().hex[:10]}"
    async with async_session_maker() as session:
        user = await user_service.create_user(
            session,
            organisation_id,
            {"email": f"{uid}@example.com", "full_name": "Pytest Owner", "firebase_uid": uid},
        )
        await workspace_service.add_member(session, workspace_id, user.user_id, "owner")
    return VerifiedAuthUser(uid=uid, email=f"{uid}@example.com")


async def test_creator_becomes_owner_of_the_new_workspace(org_ctx):
    organisation_id, first_workspace_id = org_ctx
    auth_user = await _make_owner(organisation_id, first_workspace_id)

    async with async_session_maker() as session:
        created = await workspaces_controller.create(
            organisation_id,
            workspaces_controller.WorkspaceCreate(workspace_name="Second", purpose="Sales"),
            db=session,
            auth_user=auth_user,
        )

    async with async_session_maker() as session:
        membership = (
            await session.execute(
                select(WorkspaceMember).where(WorkspaceMember.workspace_id == created.workspace_id)
            )
        ).scalar_one()
        assert membership.role == "owner"

        # The workspace-scoped guard (used by the ICP routes) now lets them in.
        member = await require_workspace_member(created.workspace_id, db=session, auth_user=auth_user)
        assert member.user_id == membership.user_id


async def test_new_workspace_starts_with_no_icp_profiles(org_ctx):
    organisation_id, first_workspace_id = org_ctx
    auth_user = await _make_owner(organisation_id, first_workspace_id)

    async with async_session_maker() as session:
        await create_icp(session, first_workspace_id, {"name": "First workspace ICP"})
        created = await workspaces_controller.create(
            organisation_id,
            workspaces_controller.WorkspaceCreate(workspace_name="Second"),
            db=session,
            auth_user=auth_user,
        )

    async with async_session_maker() as session:
        assert [i.name for i in await list_icps(session, first_workspace_id)] == ["First workspace ICP"]
        assert await list_icps(session, created.workspace_id) == []


async def test_onboarding_first_workspace_gets_a_starter_icp_and_no_member_yet(org_ctx):
    """Onboarding creates the workspace before the app_user row exists, then
    adds the membership itself - the controller must not fail or guess. It
    also seeds a Starter ICP from the industry/headquarters entered."""
    organisation_id, _ = org_ctx
    async with async_session_maker() as session:
        org = await session.get(Organisation, organisation_id)
        org.industry = "Software"
        org.headquarters_location = "San Francisco, California, USA"
        await session.commit()
    stranger = VerifiedAuthUser(uid=f"pytest-new-{uuid.uuid4().hex[:10]}", email=None)

    async with async_session_maker() as session:
        created = await workspaces_controller.create(
            organisation_id,
            workspaces_controller.WorkspaceCreate(workspace_name="Onboarding"),
            db=session,
            auth_user=stranger,
        )

    async with async_session_maker() as session:
        members = (
            await session.execute(
                select(WorkspaceMember).where(WorkspaceMember.workspace_id == created.workspace_id)
            )
        ).scalars().all()
        assert members == []

        [starter] = await list_icps(session, created.workspace_id)
        assert starter.name == STARTER_ICP_NAME
        assert starter.industries == ["Software"]
        assert starter.countries == ["United States"]


@pytest.mark.parametrize(
    ("industry", "expected"),
    [
        ("Software", ["Software"]),
        ("  software ", ["Software"]),
        ("Technology", ["Software", "Media & Internet", "Telecommunications"]),
        ("SaaS Software", ["Software"]),
        ("Underwater basket weaving", None),
        ("IT", None),
        ("Insurance", ["Insurance"]),
        ("Healthcare", ["Hospitals & Physicians Clinics", "Healthcare Services"]),
        ("", None),
        (None, None),
    ],
)
def test_starter_industries_map_onto_the_icp_vocabulary(industry, expected):
    assert _starter_industries(industry) == expected


@pytest.mark.parametrize(
    ("headquarters", "expected"),
    [
        ("San Francisco, California, USA", ["United States"]),
        ("London, UK", ["United Kingdom"]),
        ("Bengaluru, India", ["India"]),
        ("North America", ["United States", "Canada"]),
        ("São Paulo, South America", None),
        ("Toronto, Canada", ["Canada"]),
        ("", None),
        (None, None),
    ],
)
def test_starter_countries_come_from_headquarters(headquarters, expected):
    assert _starter_countries(headquarters) == expected
