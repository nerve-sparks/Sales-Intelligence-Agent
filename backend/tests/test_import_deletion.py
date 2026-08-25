"""Deleting an upload and the data it introduced.

The one that matters is test_company_shared_with_another_upload_survives.
company_import_batch is a permanent many-to-many (brief item 5) - a company
present in three uploads has three membership rows, and 64 such rows exist in
the live database today. If deletion removed every company in a batch, then
deleting an OLD upload would silently destroy companies a NEWER one still
contains, and nothing downstream would report it.
"""

import uuid

import pytest
from sqlalchemy import func, select

from app.core.db import async_session_maker
from app.models import BuyingEvent, Company, CompanyImportBatch, IcpImportBatch, LeadScore
from app.services import excel_pipeline


async def _make_batch(workspace_id, company_ids, file_name="upload.xlsx") -> uuid.UUID:
    async with async_session_maker() as session:
        batch = IcpImportBatch(
            workspace_id=workspace_id, icp_id=None, file_names=[file_name],
            files_processed=1, total_rows=len(company_ids), companies_ingested=len(company_ids),
            signals_extracted=0, matched_icp_count=0, active_count=0, nurture_count=0,
            scoring_status="complete", research_status="complete",
        )
        session.add(batch)
        await session.commit()
        await session.refresh(batch)
        for company_id in company_ids:
            session.add(CompanyImportBatch(company_id=company_id, import_batch_id=batch.import_batch_id))
        await session.commit()
        return batch.import_batch_id


async def _exists(model, pk_column, value) -> bool:
    async with async_session_maker() as session:
        return (
            await session.execute(select(func.count()).select_from(model).where(pk_column == value))
        ).scalar_one() > 0


async def test_deletes_the_batch_and_its_exclusive_companies(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch_id = await _make_batch(workspace_id, [company.company_id])

    result = await _delete(workspace_id, batch_id)

    assert result["companies_deleted"] == 1
    assert result["companies_kept"] == 0
    assert not await _exists(Company, Company.company_id, company.company_id)
    assert not await _exists(IcpImportBatch, IcpImportBatch.import_batch_id, batch_id)


async def test_company_shared_with_another_upload_survives(org_ctx, make_company):
    """The regression guard. Deleting the first upload must not remove a
    company the second one also contains."""
    _organisation_id, workspace_id = org_ctx
    shared = await make_company(company_name="Shared Co")
    only_in_first = await make_company(company_name="Exclusive Co")

    first = await _make_batch(workspace_id, [shared.company_id, only_in_first.company_id], "first.xlsx")
    second = await _make_batch(workspace_id, [shared.company_id], "second.xlsx")

    result = await _delete(workspace_id, first)

    assert result["companies_deleted"] == 1, "only the exclusive company should go"
    assert result["companies_kept"] == 1, "the shared company must be reported as kept"
    assert await _exists(Company, Company.company_id, shared.company_id)
    assert not await _exists(Company, Company.company_id, only_in_first.company_id)

    # ...and it must still belong to the surviving upload.
    async with async_session_maker() as session:
        remaining = (
            await session.execute(
                select(CompanyImportBatch.import_batch_id).where(
                    CompanyImportBatch.company_id == shared.company_id
                )
            )
        ).scalars().all()
    assert remaining == [second]


async def test_dependent_rows_are_removed_with_the_company(org_ctx, make_company):
    """buying_event and lead_score cascade. lead_score was NO ACTION until
    migration d1a7f3c8e5b2 and blocked the delete outright."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    async with async_session_maker() as session:
        session.add(BuyingEvent(
            company_id=company.company_id, canonical_key=f"del-{uuid.uuid4().hex[:10]}",
            event_type="vendor_evaluation", category="buying_stage", title="t", summary="s",
            evidence=[{"url": "https://x.example.com/1"}],
            base_strength=70, relevance=0.9, freshness=1.0, source_quality=0.9,
            extraction_confidence=0.9, status_factor=1.0, event_score=44.1,
            is_negative=False, is_stale=False,
        ))
        session.add(LeadScore(company_id=company.company_id, lead_score=50, gate_status="active"))
        await session.commit()

    result = await _delete(workspace_id, await _make_batch(workspace_id, [company.company_id]))

    assert result["buying_events_deleted"] == 1
    assert not await _exists(BuyingEvent, BuyingEvent.company_id, company.company_id)
    assert not await _exists(LeadScore, LeadScore.company_id, company.company_id)


async def test_batch_from_another_workspace_is_not_deletable(org_ctx, make_company):
    """Route-level membership already scopes by workspace, but a batch id from
    a DIFFERENT workspace must still be refused rather than deleted."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch_id = await _make_batch(workspace_id, [company.company_id])

    async with async_session_maker() as session:
        result = await excel_pipeline.delete_import_batch(session, uuid.uuid4(), batch_id)
    assert result is None, "must report not-found for another workspace's batch"
    assert await _exists(IcpImportBatch, IcpImportBatch.import_batch_id, batch_id)
    assert await _exists(Company, Company.company_id, company.company_id)


async def test_unknown_batch_reports_not_found(org_ctx):
    _organisation_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        assert await excel_pipeline.delete_import_batch(session, workspace_id, uuid.uuid4()) is None


async def _delete(workspace_id, batch_id) -> dict:
    async with async_session_maker() as session:
        result = await excel_pipeline.delete_import_batch(session, workspace_id, batch_id)
    assert result is not None
    return result
