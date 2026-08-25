"""Integration tests for per-company job/status tracking added on top of the
existing asyncio background pipeline (no Celery/Redis - see the discussion in
conversation history: the existing pipeline already does background
processing + bounded concurrency + per-company failure isolation; this adds
the missing pieces - per-company status visibility, retry-failed scoping,
cooperative cancellation, and crash-recovery).

Runs against the real Postgres DB (see conftest.py), same convention as
test_integration.py.
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.controllers import icp_imports as icp_imports_controller
from app.core.db import async_session_maker
from app.models import CompanyImportBatch, IcpImportBatch
from app.services import company_batch_status, evidence_scorer, excel_pipeline, job_recovery, search_signal_ingest, you_client

NOW = datetime(2026, 1, 15, tzinfo=timezone.utc)


async def _make_batch(workspace_id, company):
    async with async_session_maker() as session:
        return await excel_pipeline.record_import_batch(
            session, workspace_id, ["prospects.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )


async def _set_item_status(import_batch_id, company_id, status, **extra):
    async with async_session_maker() as session:
        await session.execute(
            update(CompanyImportBatch)
            .where(CompanyImportBatch.company_id == company_id, CompanyImportBatch.import_batch_id == import_batch_id)
            .values(status=status, **extra)
        )
        await session.commit()


# ---------------------------------------------------------------------------
# Job status computation
# ---------------------------------------------------------------------------

async def test_job_status_queued_when_nothing_started(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)

    async with async_session_maker() as session:
        data = await company_batch_status.compute_job_status(session, batch.import_batch_id)

    assert data["status"] == "queued"
    assert data["total"] == 1
    assert data["queued"] == 1
    assert data["progress_percentage"] == 0.0


async def test_job_status_processing_while_research_status_pending(org_ctx, make_company):
    """One company already finished, but the batch's research_status is
    still the DB default 'pending' (background task still mid-run) - the
    computed job status should read 'processing', not 'queued' or 'completed'."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)
    await _set_item_status(batch.import_batch_id, company.company_id, "completed", completed_at=NOW)

    async with async_session_maker() as session:
        data = await company_batch_status.compute_job_status(session, batch.import_batch_id)

    assert data["status"] == "processing"
    assert data["completed"] == 1


async def test_job_status_completed_when_all_done(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)
    await _set_item_status(batch.import_batch_id, company.company_id, "completed", completed_at=NOW)
    async with async_session_maker() as session:
        await session.execute(
            update(IcpImportBatch)
            .where(IcpImportBatch.import_batch_id == batch.import_batch_id)
            .values(research_status="complete", scoring_status="complete")
        )
        await session.commit()

    async with async_session_maker() as session:
        data = await company_batch_status.compute_job_status(session, batch.import_batch_id)

    assert data["status"] == "completed"
    assert data["progress_percentage"] == 100.0


async def test_job_status_partially_completed_with_some_failures(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company_ok = await make_company(company_name="OK Co")
    company_bad = await make_company(company_name="Bad Co")
    batch = await _make_batch(workspace_id, company_ok)
    async with async_session_maker() as session:
        session.add(CompanyImportBatch(company_id=company_bad.company_id, import_batch_id=batch.import_batch_id))
        await session.commit()
    await _set_item_status(batch.import_batch_id, company_ok.company_id, "completed", completed_at=NOW)
    await _set_item_status(batch.import_batch_id, company_bad.company_id, "failed", error_message="Web search unavailable", completed_at=NOW)
    async with async_session_maker() as session:
        await session.execute(
            update(IcpImportBatch)
            .where(IcpImportBatch.import_batch_id == batch.import_batch_id)
            .values(research_status="complete_with_warnings", scoring_status="complete")
        )
        await session.commit()

    async with async_session_maker() as session:
        data = await company_batch_status.compute_job_status(session, batch.import_batch_id)

    assert data["status"] == "partially_completed"
    assert data["completed"] == 1
    assert data["failed"] == 1
    assert data["total"] == 2


async def test_job_status_cancelled(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)
    async with async_session_maker() as session:
        await session.execute(
            update(IcpImportBatch)
            .where(IcpImportBatch.import_batch_id == batch.import_batch_id)
            .values(research_status="complete_with_warnings", cancel_requested_at=NOW)
        )
        await session.commit()

    async with async_session_maker() as session:
        data = await company_batch_status.compute_job_status(session, batch.import_batch_id)

    assert data["status"] == "cancelled"


async def test_job_status_failed_on_unhandled_exception(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)
    async with async_session_maker() as session:
        await session.execute(
            update(IcpImportBatch)
            .where(IcpImportBatch.import_batch_id == batch.import_batch_id)
            .values(research_status="failed", scoring_status="complete", processing_error="boom")
        )
        await session.commit()

    async with async_session_maker() as session:
        data = await company_batch_status.compute_job_status(session, batch.import_batch_id)

    assert data["status"] == "failed"


# ---------------------------------------------------------------------------
# Retry-failed scoping
# ---------------------------------------------------------------------------

async def test_retry_failed_ids_exclude_needs_review_and_completed(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    failed_co = await make_company(company_name="Failed")
    needs_review_co = await make_company(company_name="NeedsReview")
    completed_co = await make_company(company_name="Completed")
    batch = await _make_batch(workspace_id, failed_co)
    async with async_session_maker() as session:
        session.add(CompanyImportBatch(company_id=needs_review_co.company_id, import_batch_id=batch.import_batch_id))
        session.add(CompanyImportBatch(company_id=completed_co.company_id, import_batch_id=batch.import_batch_id))
        await session.commit()
    await _set_item_status(batch.import_batch_id, failed_co.company_id, "failed", error_message="Web search unavailable")
    await _set_item_status(batch.import_batch_id, needs_review_co.company_id, "needs_review", error_message="No domain", is_permanent_failure=True)
    await _set_item_status(batch.import_batch_id, completed_co.company_id, "completed")

    async with async_session_maker() as session:
        ids = await company_batch_status.failed_company_ids(session, batch.import_batch_id)

    assert ids == [failed_co.company_id]


async def test_reset_for_retry_clears_error_and_increments_count(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)
    await _set_item_status(batch.import_batch_id, company.company_id, "failed", error_message="boom", retry_count=1)

    async with async_session_maker() as session:
        await company_batch_status.reset_for_retry(session, company.company_id, batch.import_batch_id)
        await session.commit()

    async with async_session_maker() as session:
        row = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == company.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()

    assert row.status == "queued"
    assert row.error_message is None
    assert row.retry_count == 2


async def test_retry_failed_endpoint_only_touches_failed_companies(org_ctx, make_company):
    """End-to-end through the controller: only 'failed' companies get
    re-queued and re-processed; 'completed'/'needs_review' are untouched."""
    organisation_id, workspace_id = org_ctx
    failed_co = await make_company(company_name="Retry Me")
    completed_co = await make_company(company_name="Leave Me")
    batch = await _make_batch(workspace_id, failed_co)
    async with async_session_maker() as session:
        session.add(CompanyImportBatch(company_id=completed_co.company_id, import_batch_id=batch.import_batch_id))
        await session.commit()
    await _set_item_status(batch.import_batch_id, failed_co.company_id, "failed", error_message="Web search unavailable")
    await _set_item_status(batch.import_batch_id, completed_co.company_id, "completed", completed_at=NOW)

    class _NoOpBackgroundTasks:
        def add_task(self, *_args, **_kwargs):
            pass  # verified via DB state below, not via re-running the real pipeline here

    async with async_session_maker() as session:
        result = await icp_imports_controller.retry_failed(
            workspace_id, batch.import_batch_id, _NoOpBackgroundTasks(), db=session
        )
        await session.commit()

    assert result.retried_count == 1

    async with async_session_maker() as session:
        failed_row = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == failed_co.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()
        completed_row = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == completed_co.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()

    assert failed_row.status == "queued"
    assert failed_row.retry_count == 1
    assert completed_row.status == "completed"  # never touched by retry


# ---------------------------------------------------------------------------
# Permanent vs transient failure classification
# ---------------------------------------------------------------------------

async def test_company_without_a_domain_is_still_researched(org_ctx, make_company, monkeypatch):
    """A missing website used to mark a company needs_review and skip research
    entirely, on the assumption that the domain was the search anchor. It never
    was - you_client.build_query keys on the company NAME and only falls back to
    the domain - and the rule excluded 2,552 of one upload's 2,573 companies.

    The company must therefore reach a real research stage rather than being
    parked as unresolvable."""
    organisation_id, workspace_id = org_ctx
    company = await make_company(company_domain=None)
    batch = await _make_batch(workspace_id, company)
    monkeypatch.setattr(you_client, "is_configured", lambda: True)

    # Stub the search: now that a domain-less company IS researched, leaving
    # this unpatched would fire a real you.com request from the test suite.
    async def _search(_domain, _company_name=None, num=15, **_kwargs):
        return []

    monkeypatch.setattr(you_client, "search", _search)

    async with async_session_maker() as session:
        await search_signal_ingest.research_companies(
            session, organisation_id, company_ids=[company.company_id], import_batch_id=batch.import_batch_id,
        )
        await session.commit()

    async with async_session_maker() as session:
        row = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == company.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()

    assert row.status != "needs_review", (
        "a company with no domain must be researched by name, not parked as unresolvable"
    )
    assert row.is_permanent_failure is not True, (
        "a missing website is no longer a permanent failure - the search is anchored "
        "on the company name, so there is nothing unresolvable about it"
    )


# ---------------------------------------------------------------------------
# Scoring failure isolation (one bad company must not drop its chunk-mates)
# ---------------------------------------------------------------------------

async def test_scoring_exception_for_one_company_does_not_abort_chunk_mate(org_ctx, make_company, monkeypatch):
    organisation_id, workspace_id = org_ctx
    good_co = await make_company(company_name="Good")
    bad_co = await make_company(company_name="Bad")
    batch = await _make_batch(workspace_id, good_co)
    async with async_session_maker() as session:
        session.add(CompanyImportBatch(company_id=bad_co.company_id, import_batch_id=batch.import_batch_id))
        await session.commit()
    # In the real flow, research_companies() bumps a company to 'scoring'
    # before evidence_scorer ever runs (mark_completed only flips 'scoring'
    # -> 'completed') - set that up directly here since this test calls
    # run_scoring() standalone, skipping the research phase.
    await _set_item_status(batch.import_batch_id, good_co.company_id, "scoring")
    await _set_item_status(batch.import_batch_id, bad_co.company_id, "scoring")

    real_score_company = evidence_scorer.score_company

    async def _flaky_score_company(session, company, now):
        if company.company_id == bad_co.company_id:
            raise RuntimeError("simulated scoring bug")
        return await real_score_company(session, company, now)

    monkeypatch.setattr(evidence_scorer, "score_company", _flaky_score_company)

    async with async_session_maker() as session:
        await evidence_scorer.run_scoring(
            session, organisation_id, company_ids=[good_co.company_id, bad_co.company_id], import_batch_id=batch.import_batch_id,
        )
        await session.commit()

    async with async_session_maker() as session:
        good_row = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == good_co.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()
        bad_row = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == bad_co.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()

    # good_co still gets scored/completed despite bad_co's exception in the
    # SAME chunk - one company's failure never drops its chunk-mates.
    assert good_row.status == "completed"
    assert bad_row.status == "failed"
    assert "simulated scoring bug" in bad_row.error_message


# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------

async def test_cancel_before_processing_skips_research_and_scoring(org_ctx, make_company, monkeypatch):
    organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)

    called = {"research": False, "scoring": False}

    async def _fail_if_called_research(*_a, **_kw):
        called["research"] = True
        return {"researched": 0, "successful": 0, "failed": 0, "research_failures": 0, "llm_failures": 0, "events_stored": 0}

    async def _fail_if_called_scoring(*_a, **_kw):
        called["scoring"] = True
        return {}

    monkeypatch.setattr(search_signal_ingest, "research_companies", _fail_if_called_research)
    monkeypatch.setattr(evidence_scorer, "run_scoring", _fail_if_called_scoring)

    async with async_session_maker() as session:
        await session.execute(
            update(IcpImportBatch)
            .where(IcpImportBatch.import_batch_id == batch.import_batch_id)
            .values(cancel_requested_at=NOW)
        )
        await session.commit()

    await excel_pipeline.score_companies_in_background(organisation_id, workspace_id, batch.import_batch_id)

    assert called["research"] is False
    assert called["scoring"] is False

    async with async_session_maker() as session:
        refreshed = await session.get(IcpImportBatch, batch.import_batch_id)
    assert refreshed.research_status == "complete_with_warnings"
    assert refreshed.scoring_status == "complete"  # never left stuck 'pending'


async def test_cancel_endpoint_sets_flag_and_reflects_in_status(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)

    async with async_session_maker() as session:
        result = await icp_imports_controller.cancel(workspace_id, batch.import_batch_id, db=session)
        await session.commit()

    assert result.status == "cancelled"

    async with async_session_maker() as session:
        refreshed = await session.get(IcpImportBatch, batch.import_batch_id)
    assert refreshed.cancel_requested_at is not None


# ---------------------------------------------------------------------------
# Crash recovery - a stopped backend STOPS the job, never silently resumes it
# ---------------------------------------------------------------------------

async def test_stop_interrupted_jobs_does_not_resume_processing(org_ctx, make_company, monkeypatch):
    organisation_id, workspace_id = org_ctx
    company = await make_company()
    batch = await _make_batch(workspace_id, company)  # research_status defaults to 'pending'
    await _set_item_status(batch.import_batch_id, company.company_id, "researching")

    called = False

    async def _fail_if_called(*_a, **_kw):
        nonlocal called
        called = True

    # The old crash-recovery behaviour resumed processing via this function -
    # asserting it's never called is the core of this test (brief: a stopped
    # backend must not silently continue work in the background).
    monkeypatch.setattr(excel_pipeline, "score_companies_in_background", _fail_if_called)

    count = await job_recovery.stop_interrupted_jobs()
    assert count >= 1
    assert called is False

    async with async_session_maker() as session:
        refreshed_batch = await session.get(IcpImportBatch, batch.import_batch_id)
        refreshed_item = (
            await session.execute(
                select(CompanyImportBatch).where(
                    CompanyImportBatch.company_id == company.company_id,
                    CompanyImportBatch.import_batch_id == batch.import_batch_id,
                )
            )
        ).scalar_one()

    # Batch reaches an honest terminal state instead of staying 'pending' forever.
    assert refreshed_batch.research_status == "complete_with_warnings"
    assert refreshed_batch.scoring_status == "complete"
    assert refreshed_batch.processing_warnings == [job_recovery.STOPPED_MESSAGE]
    # The in-flight company is marked failed (retryable), not left stuck at 'researching'.
    assert refreshed_item.status == "failed"
    assert refreshed_item.error_message == job_recovery.STOPPED_MESSAGE
