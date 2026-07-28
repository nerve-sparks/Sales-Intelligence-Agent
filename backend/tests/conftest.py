"""Shared fixtures for the integration suite (brief item 25).

Runs against the REAL Postgres DB pointed at by DATABASE_URL (same
convention as this project's manual verification passes) - nothing here
mocks the database layer. Only external network calls (Tavily, LLM,
Nexus scraper) are ever monkeypatched, and only within the specific tests
that need to simulate those services being unavailable.

Every test gets its own throwaway Organisation (+ Workspace) via the
`org_ctx` fixture, and teardown deletes it - LeadScore has no ON DELETE
CASCADE from company (see lead_score_company_id_key's plain FK, no
ondelete), so it must be cleared explicitly before the Organisation
delete cascades through company -> buying_event/decision_maker/
company_import_batch/lead_score's siblings.
"""

import asyncio
import sys
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import async_session_maker  # noqa: E402
from app.models import Company, LeadScore, Organisation  # noqa: E402
from app.services import organisation_service, workspace_service  # noqa: E402

pytest_plugins: list[str] = []


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped loop so the async engine's asyncpg connections (opened
    on the loop that first used them) stay valid across every test - a fresh
    per-test loop would otherwise make pooled connections "attached to a
    different loop" on the second test."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


async def _cleanup_organisation(organisation_id: uuid.UUID) -> None:
    async with async_session_maker() as session:
        company_ids = select(Company.company_id).where(Company.organisation_id == organisation_id)
        await session.execute(delete(LeadScore).where(LeadScore.company_id.in_(company_ids)))
        await session.execute(delete(Organisation).where(Organisation.organisation_id == organisation_id))
        await session.commit()


@pytest_asyncio.fixture
async def org_ctx():
    """Creates a throwaway Organisation + Workspace for one test, deletes both
    (and everything that cascades from them) afterward. Yields
    (organisation_id, workspace_id)."""
    async with async_session_maker() as session:
        org = await organisation_service.create_organisation(
            session, {"company_name": f"pytest-org-{uuid.uuid4().hex[:8]}"}
        )
        workspace = await workspace_service.create_workspace(
            session, org.organisation_id, {"workspace_name": "pytest-workspace"}
        )
    try:
        yield org.organisation_id, workspace.workspace_id
    finally:
        await _cleanup_organisation(org.organisation_id)


@pytest_asyncio.fixture
async def make_company(org_ctx):
    """Factory fixture: make_company(**overrides) -> Company, already
    committed, scoped to this test's throwaway organisation."""
    organisation_id, _workspace_id = org_ctx
    created: list[uuid.UUID] = []

    async def _make(**overrides) -> Company:
        async with async_session_maker() as session:
            values = dict(
                organisation_id=organisation_id,
                zi_company_id=overrides.pop("zi_company_id", uuid.uuid4().int % 1_000_000_000),
                company_name=overrides.pop("company_name", "Acme Test Corp"),
                company_domain=overrides.pop("company_domain", f"{uuid.uuid4().hex[:10]}.example.com"),
            )
            values.update(overrides)
            company = Company(**values)
            session.add(company)
            await session.commit()
            await session.refresh(company)
            created.append(company.company_id)
            return company

    yield _make
