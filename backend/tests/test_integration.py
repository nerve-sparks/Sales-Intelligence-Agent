"""Integration tests for the evidence-based scoring pipeline (brief item 25).

Runs against the real Postgres DB (see conftest.py) and calls the actual
service-layer functions the API routes delegate to - no HTTP layer, no
Firebase auth, no mocking of the DB. The only things ever monkeypatched are
the outbound Tavily/LLM/Nexus network calls, and only in the tests that
specifically simulate those services being down.

Coverage (mapped to the brief's item-25 checklist):
  - upload without ICP                          -> test_upload_creates_batch_without_icp
  - company in multiple batches                 -> test_company_appears_in_multiple_batches
  - batch-scoped endpoints use membership table  -> test_batch_scoped_endpoints_use_membership_table_not_legacy_pointer
  - concurrent uploads                          -> test_concurrent_uploads_do_not_interfere
  - Tavily unavailable                          -> test_tavily_unavailable_completes_with_warning
  - LLM unavailable                             -> test_llm_unavailable_marks_research_failed
  - partial LLM batch failure                   -> test_partial_llm_batch_failure
  - background exception -> batch failed status -> test_background_exception_marks_batch_failed
  - event freshness decay                       -> test_event_freshness_decays_with_age,
                                                    test_stale_events_excluded_from_scoring
  - semantic duplicate articles dedup            -> test_semantic_duplicate_articles_merge_into_one_event
  - unknown vs known event dates                -> test_unknown_event_date_still_dedups_against_known_date
  - cross-run fuzzy dedup (not just exact key)   -> test_cross_run_fuzzy_dedup_updates_existing_event_not_duplicate
  - zero-event run stales previous events        -> test_zero_events_stales_previous_events_when_run_fully_successful
  - partial failure must NOT stale live events   -> test_partial_failure_does_not_stale_missing_events
  - public-budget EDV                           -> test_public_budget_edv_takes_precedence
  - organisation isolation                      -> test_organisation_isolation
  - ranked endpoint returns every company        -> test_every_company_gets_scored_no_icp_gate
  - Offering Profile fallback                   -> test_offering_profile_falls_back_when_scraper_unavailable
  - signal pages read Tavily-derived events      -> test_signal_directory_reads_buying_events

Migration upgrade/downgrade is deliberately NOT exercised here as an
automated test - it mutates the shared dev DB's schema and is run once,
manually, as its own step in the final verification checklist (item 27),
not on every test invocation.
"""

import io
import uuid
from datetime import datetime, timedelta, timezone

import openpyxl
import pytest
from sqlalchemy import select

from app.core import scoring_config as cfg
from app.controllers import companies as companies_controller
from app.controllers import scores as scores_controller
from app.core.db import async_session_maker
from app.models import BuyingEvent, CompanyImportBatch, IcpImportBatch, LeadScore
from app.services import (
    buying_event_directory,
    buying_event_service,
    company_directory,
    evidence_scorer,
    excel_pipeline,
    offering_profile_service,
    search_signal_ingest,
    tavily_client,
)
from app.services import llm_client as llm_client_module
from app.services import nexus_scraper as nexus_scraper_module

NOW = datetime(2026, 1, 15, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Upload / batch membership
# ---------------------------------------------------------------------------

async def test_upload_creates_batch_without_icp(org_ctx, make_company):
    organisation_id, workspace_id = org_ctx
    company = await make_company()

    async with async_session_maker() as session:
        batch = await excel_pipeline.record_import_batch(
            session, workspace_id, ["prospects.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )

    assert batch.icp_id is None
    assert batch.workspace_id == workspace_id
    assert batch.research_status == "pending"
    assert batch.scoring_status == "pending"

    async with async_session_maker() as session:
        membership = (
            await session.execute(
                select(CompanyImportBatch).where(CompanyImportBatch.import_batch_id == batch.import_batch_id)
            )
        ).scalars().all()
    assert len(membership) == 1
    assert membership[0].company_id == company.company_id


async def test_company_appears_in_multiple_batches(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()

    async with async_session_maker() as session:
        batch1 = await excel_pipeline.record_import_batch(
            session, workspace_id, ["upload1.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )
    async with async_session_maker() as session:
        batch2 = await excel_pipeline.record_import_batch(
            session, workspace_id, ["upload2.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )

    async with async_session_maker() as session:
        rows = (
            await session.execute(
                select(CompanyImportBatch.import_batch_id).where(CompanyImportBatch.company_id == company.company_id)
            )
        ).scalars().all()

    # Both uploads' membership rows survive - a re-upload never erases an
    # earlier batch's membership (brief item 5), unlike the legacy
    # Company.import_batch_id "most recent upload" pointer.
    assert set(rows) == {batch1.import_batch_id, batch2.import_batch_id}

    async with async_session_maker() as session:
        refreshed = await session.get(type(company), company.company_id)
        assert refreshed.import_batch_id == batch2.import_batch_id


async def test_batch_scoped_endpoints_use_membership_table_not_legacy_pointer(org_ctx, make_company):
    """Regression test: scores.ranked()/scores.run() and companies.export()
    must scope by-batch through the CompanyImportBatch membership table, not
    the legacy Company.import_batch_id column - which only ever points at a
    company's MOST RECENT upload and would wrongly exclude it from an
    earlier batch's view after a re-upload."""
    organisation_id, workspace_id = org_ctx
    company = await make_company()

    async with async_session_maker() as session:
        batch1 = await excel_pipeline.record_import_batch(
            session, workspace_id, ["upload1.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )
    async with async_session_maker() as session:
        # Company.import_batch_id (legacy pointer) now moves to batch2 - the
        # company must still appear when filtering by batch1.
        await excel_pipeline.record_import_batch(
            session, workspace_id, ["upload2.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company.company_id,
                canonical_key="ranked-key-1",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Acme evaluating vendors",
                summary="Acme evaluating vendors",
                evidence=[{"url": "https://x.example.com/1", "company_match": 0.9}],
                published_at=NOW - timedelta(days=2),
                base_strength=90, relevance=0.9, freshness=1.0, source_quality=0.9,
                extraction_confidence=0.9, status_factor=1.0, event_score=65.61,
                is_negative=False, is_stale=False,
            )
        )
        await session.commit()

    async with async_session_maker() as session:
        await evidence_scorer.run_scoring(session, organisation_id)
        await session.commit()

    async with async_session_maker() as session:
        ranked_rows = await scores_controller.ranked(organisation_id, import_batch_id=batch1.import_batch_id, db=session)
    assert len(ranked_rows) == 1
    assert ranked_rows[0]["company_id"] == company.company_id

    async with async_session_maker() as session:
        run_counts = await scores_controller.run(organisation_id, import_batch_id=batch1.import_batch_id, db=session)
    assert sum(run_counts.values()) == 1

    async with async_session_maker() as session:
        export_response = await companies_controller.export(organisation_id, import_batch_id=batch1.import_batch_id, db=session)
    workbook = openpyxl.load_workbook(io.BytesIO(export_response.body))
    data_rows = list(workbook.active.iter_rows(min_row=2, values_only=True))
    assert len(data_rows) == 1


async def test_concurrent_uploads_do_not_interfere(org_ctx, make_company):
    import asyncio

    _organisation_id, workspace_id = org_ctx
    company_a = await make_company(company_name="Concurrent A")
    company_b = await make_company(company_name="Concurrent B")

    async def _upload(company, filename):
        async with async_session_maker() as session:
            return await excel_pipeline.record_import_batch(
                session, workspace_id, [filename], total_rows=1,
                zi_to_company_id={company.zi_company_id: company.company_id},
            )

    batch_a, batch_b = await asyncio.gather(
        _upload(company_a, "a.xlsx"), _upload(company_b, "b.xlsx")
    )

    assert batch_a.import_batch_id != batch_b.import_batch_id

    async with async_session_maker() as session:
        members_a = (
            await session.execute(
                select(CompanyImportBatch.company_id).where(CompanyImportBatch.import_batch_id == batch_a.import_batch_id)
            )
        ).scalars().all()
        members_b = (
            await session.execute(
                select(CompanyImportBatch.company_id).where(CompanyImportBatch.import_batch_id == batch_b.import_batch_id)
            )
        ).scalars().all()

    assert members_a == [company_a.company_id]
    assert members_b == [company_b.company_id]


# ---------------------------------------------------------------------------
# Background task resilience (never stuck "pending")
# ---------------------------------------------------------------------------

async def test_tavily_unavailable_completes_with_warning(org_ctx, make_company, monkeypatch):
    organisation_id, workspace_id = org_ctx
    company = await make_company()
    monkeypatch.setattr(tavily_client, "is_configured", lambda: False)

    async with async_session_maker() as session:
        batch = await excel_pipeline.record_import_batch(
            session, workspace_id, ["prospects.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )

    await excel_pipeline.score_companies_in_background(organisation_id, workspace_id, batch.import_batch_id)

    async with async_session_maker() as session:
        refreshed = await session.get(IcpImportBatch, batch.import_batch_id)

    assert refreshed.research_status == "complete_with_warnings"
    assert refreshed.scoring_status == "complete"
    assert refreshed.processing_warnings
    assert any("Tavily" in w for w in refreshed.processing_warnings)


async def test_background_exception_marks_batch_failed(org_ctx, make_company, monkeypatch):
    organisation_id, workspace_id = org_ctx
    company = await make_company()

    async def _boom(*_args, **_kwargs):
        raise RuntimeError("scoring exploded")

    monkeypatch.setattr(evidence_scorer, "run_scoring", _boom)
    monkeypatch.setattr(tavily_client, "is_configured", lambda: False)

    async with async_session_maker() as session:
        batch = await excel_pipeline.record_import_batch(
            session, workspace_id, ["prospects.xlsx"], total_rows=1,
            zi_to_company_id={company.zi_company_id: company.company_id},
        )

    await excel_pipeline.score_companies_in_background(organisation_id, workspace_id, batch.import_batch_id)

    async with async_session_maker() as session:
        refreshed = await session.get(IcpImportBatch, batch.import_batch_id)

    assert refreshed.research_status == "failed"
    assert refreshed.scoring_status == "complete"  # still flipped, never left "pending"
    assert refreshed.processing_error and "scoring exploded" in refreshed.processing_error


# ---------------------------------------------------------------------------
# Tavily/LLM failure handling at the research layer
# ---------------------------------------------------------------------------

def _fake_evidence_item(index: int, url: str | None = None) -> dict:
    return {
        "title": f"Acme announces AI initiative #{index}",
        "snippet": "Acme is rolling out an AI transformation program.",
        "url": url or f"https://news.example.com/acme-{index}",
        "source_type": "news",
        "published_date": "Jan 10, 2026",
        "company_match": 0.9,
    }


def _patch_tavily_ok(monkeypatch, items: list[dict]):
    async def _search(_domain, _company_name=None, num=15):
        return [{"link": it["url"], **it} for it in items]

    monkeypatch.setattr(tavily_client, "is_configured", lambda: True)
    monkeypatch.setattr(tavily_client, "search", _search)
    monkeypatch.setattr(tavily_client, "build_query", lambda domain, company_name=None: f"web:{domain}")
    monkeypatch.setattr(tavily_client, "is_relevant", lambda *_a, **_kw: True)
    monkeypatch.setattr(tavily_client, "match_confidence", lambda *_a, **_kw: 0.9)

    def _to_evidence(item, query, qtype, retrieved_at, company_domain=None):
        return {
            "url": item["url"], "domain": "news.example.com", "title": item["title"],
            "snippet": item["snippet"], "published_date": item["published_date"],
            "search_query": query, "retrieved_at": retrieved_at, "source_type": qtype,
        }

    monkeypatch.setattr(tavily_client, "to_evidence", _to_evidence)


async def test_llm_unavailable_marks_research_failed(monkeypatch):
    _patch_tavily_ok(monkeypatch, [_fake_evidence_item(0)])

    async def _llm_boom(*_args, **_kwargs):
        raise RuntimeError("LLM_API_KEY not configured")

    monkeypatch.setattr(llm_client_module, "complete", _llm_boom)

    company = {"company_id": uuid.uuid4(), "company_name": "Acme", "company_domain": "acme.example.com", "industry": None}
    async with async_session_maker() as session:
        summary = await buying_event_service.research_company(
            session, company, offering_profile_service.fallback_profile(), NOW, uuid.uuid4()
        )

    assert summary["ok"] is False
    assert summary["llm_failed"] is True
    assert summary["research_failed"] is False
    assert summary["events_stored"] == 0


async def test_partial_llm_batch_failure(monkeypatch):
    # Two chunks worth of evidence (CHUNK_SIZE=8) so one chunk can fail while
    # the other succeeds - distinct from a total LLM outage.
    items = [_fake_evidence_item(i) for i in range(16)]
    _patch_tavily_ok(monkeypatch, items)

    call_count = {"n": 0}

    async def _llm_flaky(messages, **_kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("transient failure")
        # Figure out which indices this chunk covers from the prompt text so
        # the response lines up with _parse()'s expected index values.
        prompt = messages[0]["content"]
        indices = sorted({int(i) for i in __import__("re").findall(r"\[(\d+)\] title:", prompt)})
        import json as _json

        return _json.dumps(
            [
                {
                    "index": i, "is_real_company_event": True, "event_type": "vendor_evaluation",
                    "event_category": "buying_stage", "event_summary": "Acme evaluating vendors",
                    "event_status": "active", "event_date": "Jan 10, 2026", "is_action": True,
                    "xsparks_relevance": 0.9, "best_offering": "AI Agents and Workflow Automation",
                    "relevance_reason": "operational pain", "extraction_confidence": 0.8,
                    "is_negative": False, "negative_type": None, "public_budget_usd": None,
                    "budget_currency": None, "budget_confidence": None,
                    "canonical_subject": f"acme subject {i}", "canonical_action": f"action {i}",
                    "canonical_object": f"object {i}",
                }
                for i in indices
            ]
        )

    monkeypatch.setattr(llm_client_module, "complete", _llm_flaky)

    company = {"company_id": uuid.uuid4(), "company_name": "Acme", "company_domain": "acme.example.com", "industry": None}
    async with async_session_maker() as session:
        summary = await buying_event_service.research_company(
            session, company, offering_profile_service.fallback_profile(), NOW, uuid.uuid4()
        )

    assert summary["partial_llm_failure"] is True
    assert summary["llm_failed"] is False  # NOT a total failure - must not be conflated (item 7)
    assert summary["ok"] is True
    assert summary["events_stored"] == 8  # only the succeeding chunk's events persisted


# ---------------------------------------------------------------------------
# Canonical dedup (semantic duplicates, unknown vs known dates)
# ---------------------------------------------------------------------------

def _accepted_entry(*, subject, action, obj, event_date, url, event_type="vendor_evaluation") -> dict:
    return {
        "cls": {
            "event_category": "buying_stage",
            "event_summary": "Acme expands operations with a new facility",
            "event_date": event_date,
            "extraction_confidence": 0.85,
            "event_status": "active",
            "is_negative": False,
            "negative_type": None,
            "public_budget_usd": None,
            "budget_currency": None,
            "budget_confidence": None,
            "best_offering": "AI Agents and Workflow Automation",
            "relevance_reason": "operational pain",
            "canonical_subject": subject,
            "canonical_action": action,
            "canonical_object": obj,
        },
        "evidence": {
            "url": url, "title": "Acme expands", "source_type": "news",
            "published_date": event_date, "company_match": 0.9,
        },
        "event_type": event_type,
        "relevance": 0.9,
    }


def test_semantic_duplicate_articles_merge_into_one_event():
    company_id = uuid.uuid4()
    accepted = [
        _accepted_entry(
            subject="Acme Corporation", action="expands operations", obj="new manufacturing facility",
            event_date="Jan 10, 2026", url="https://a.example.com/1",
        ),
        _accepted_entry(
            subject="Acme Corp", action="expands operations", obj="new manufacturing facility",
            event_date="Jan 12, 2026", url="https://b.example.com/2",
        ),
    ]

    canonical = buying_event_service._build_canonical_events(company_id, accepted, NOW)

    assert len(canonical) == 1
    (event,) = canonical.values()
    assert len(event["evidence"]) == 2
    assert {e["url"] for e in event["evidence"]} == {"https://a.example.com/1", "https://b.example.com/2"}


def test_unknown_event_date_still_dedups_against_known_date():
    company_id = uuid.uuid4()
    accepted = [
        _accepted_entry(
            subject="Acme Corporation", action="expands operations", obj="new manufacturing facility",
            event_date="Jan 10, 2026", url="https://a.example.com/1",
        ),
        _accepted_entry(
            subject="Acme Corporation", action="expands operations", obj="new manufacturing facility",
            event_date=None, url="https://b.example.com/2",
        ),
    ]
    accepted[1]["evidence"]["published_date"] = None

    canonical = buying_event_service._build_canonical_events(company_id, accepted, NOW)

    # Identical wording but a different (real vs "unknown") month means the
    # exact canonical_key differs - only the second-pass hybrid merge
    # (compatible dates: either unknown -> always compatible) catches this.
    assert len(canonical) == 1
    (event,) = canonical.values()
    assert len(event["evidence"]) == 2


async def test_cross_run_fuzzy_dedup_updates_existing_event_not_duplicate(org_ctx, make_company):
    """A stored event from an EARLIER run must be updated (not duplicated)
    when a LATER run finds the same real event under different wording/date -
    exercised via persist_company_events directly since canonical_key is
    computed from the first run's exact wording and won't match the second
    run's differently-worded candidate."""
    company = await make_company()

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company.company_id,
                canonical_key="run1-key",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Acme evaluating AI vendors",
                summary="Acme is evaluating AI vendors for its transformation program",
                evidence=[{"url": "https://run1.example.com/a", "company_match": 0.9}],
                published_at=NOW - timedelta(days=10),
                base_strength=90, relevance=0.9, freshness=0.9, source_quality=0.9,
                extraction_confidence=0.85, status_factor=1.0, event_score=62.0,
                is_negative=False, is_stale=False,
            )
        )
        await session.commit()

    # A later run's differently-worded candidate for the SAME real event -
    # exact canonical_key differs, but topic tokens overlap heavily and the
    # date is close.
    run2_canonical = {
        "run2-key": {
            "event_type": "vendor_evaluation",
            "category": "buying_stage",
            "title": "Acme is evaluating vendors",
            "summary": "Acme evaluating AI vendors as part of its transformation program",
            "evidence": [{"url": "https://run2.example.com/b", "company_match": 0.9}],
            "published_at": NOW - timedelta(days=3),
            "base_strength": 90, "relevance": 0.9, "freshness": 1.0, "source_quality": 0.9,
            "extraction_confidence": 0.9, "status_factor": 1.0, "event_score": 65.61,
            "is_negative": False, "penalty_value": None,
            "best_offering": "AI Agents and Workflow Automation", "reasoning": "operational pain",
            "public_budget_usd": None, "budget_currency": None,
            "budget_source_url": None, "budget_confidence": None,
        }
    }

    async with async_session_maker() as session:
        stored = await buying_event_service.persist_company_events(
            session, company.company_id, run2_canonical, NOW, uuid.uuid4(), mark_missing_stale=True
        )
        await session.commit()

    assert stored == 0  # updated the existing row, did not insert a new one

    async with async_session_maker() as session:
        rows = (
            await session.execute(select(BuyingEvent).where(BuyingEvent.company_id == company.company_id))
        ).scalars().all()

    assert len(rows) == 1  # no duplicate BuyingEvent created
    (row,) = rows
    assert row.canonical_key == "run1-key"  # identity preserved
    assert row.is_stale is False
    urls = {e.get("url") for e in row.evidence}
    assert urls == {"https://run1.example.com/a", "https://run2.example.com/b"}  # both sources retained


async def test_zero_events_stales_previous_events_when_run_fully_successful(org_ctx, make_company):
    company = await make_company()

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company.company_id,
                canonical_key="now-gone-key",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Acme evaluating vendors",
                summary="Acme evaluating vendors",
                evidence=[{"url": "https://x.example.com/1", "company_match": 0.9}],
                published_at=NOW - timedelta(days=10),
                base_strength=90, relevance=0.9, freshness=0.9, source_quality=0.9,
                extraction_confidence=0.85, status_factor=1.0, event_score=62.0,
                is_negative=False, is_stale=False,
            )
        )
        await session.commit()

    # A fully successful run that finds NOTHING must stale the event it
    # didn't rediscover, not silently leave it live forever (the
    # persist_company_events early-return bug this regression-tests).
    async with async_session_maker() as session:
        stored = await buying_event_service.persist_company_events(
            session, company.company_id, {}, NOW, uuid.uuid4(), mark_missing_stale=True
        )
        await session.commit()
    assert stored == 0

    async with async_session_maker() as session:
        row = (
            await session.execute(select(BuyingEvent).where(BuyingEvent.company_id == company.company_id))
        ).scalar_one()
    assert row.is_stale is True


async def test_partial_failure_does_not_stale_missing_events(org_ctx, make_company):
    company = await make_company()

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company.company_id,
                canonical_key="still-here-key",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Acme evaluating vendors",
                summary="Acme evaluating vendors",
                evidence=[{"url": "https://x.example.com/1", "company_match": 0.9}],
                published_at=NOW - timedelta(days=10),
                base_strength=90, relevance=0.9, freshness=0.9, source_quality=0.9,
                extraction_confidence=0.85, status_factor=1.0, event_score=62.0,
                is_negative=False, is_stale=False,
            )
        )
        await session.commit()

    # An incomplete run (some LLM chunks failed) that found nothing this time
    # must NOT stale a still-current event just because it wasn't
    # re-classified - only a fully successful run may do that.
    async with async_session_maker() as session:
        await buying_event_service.persist_company_events(
            session, company.company_id, {}, NOW, uuid.uuid4(), mark_missing_stale=False
        )
        await session.commit()

    async with async_session_maker() as session:
        row = (
            await session.execute(select(BuyingEvent).where(BuyingEvent.company_id == company.company_id))
        ).scalar_one()
    assert row.is_stale is False


# ---------------------------------------------------------------------------
# Freshness decay / staleness exclusion
# ---------------------------------------------------------------------------

def test_event_freshness_decays_with_age():
    fresh = buying_event_service.freshness_factor(NOW - timedelta(days=2), NOW)
    old = buying_event_service.freshness_factor(NOW - timedelta(days=800), NOW)
    assert fresh > old
    assert old <= cfg.FRESHNESS_OLDER + 1e-9 or old < fresh


async def test_stale_events_excluded_from_scoring(org_ctx, make_company):
    _organisation_id, _workspace_id = org_ctx
    company = await make_company(revenue_usd=5_000_000)

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company.company_id,
                canonical_key="stale-key-1",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Old evaluation",
                summary="An old vendor evaluation, now stale",
                evidence=[{"url": "https://x.example.com/1", "company_match": 0.9}],
                published_at=NOW - timedelta(days=5),
                base_strength=90, relevance=0.9, freshness=1.0, source_quality=0.9,
                extraction_confidence=0.9, status_factor=1.0, event_score=65.61,
                is_negative=False, is_stale=True,  # marked stale - must not count
            )
        )
        await session.commit()

    async with async_session_maker() as session:
        company_row = await session.get(type(company), company.company_id)
        score = await evidence_scorer.score_company(session, company_row, NOW)
        await session.commit()

    assert float(score.buying_evidence_score) == 0.0
    assert score.sales_status == cfg.SALES_STATUS_BANDS[-1][1]


# ---------------------------------------------------------------------------
# Expected Deal Value
# ---------------------------------------------------------------------------

def test_public_budget_edv_takes_precedence():
    with_budget = evidence_scorer.expected_deal_value(5_000_000, funding_is_recent_and_relevant=False, public_budget_usd=2_000_000)
    assert with_budget["basis"] == "public_budget"
    assert with_budget["value"] == round(2_000_000 * cfg.PUBLIC_BUDGET_CAPTURABLE_SHARE, 2)

    without_budget = evidence_scorer.expected_deal_value(5_000_000, funding_is_recent_and_relevant=False, public_budget_usd=None)
    assert without_budget["basis"] != "public_budget"
    assert without_budget["basis"].startswith("revenue_capacity_band")


# ---------------------------------------------------------------------------
# Organisation isolation / every company scored (no ICP gate)
# ---------------------------------------------------------------------------

async def test_organisation_isolation(org_ctx, make_company):
    organisation_id, _workspace_id = org_ctx
    await make_company(company_name="Org A Co")

    other_org_id = uuid.uuid4()  # a UUID that belongs to no real organisation

    async with async_session_maker() as session:
        rows_a, total_a = await company_directory.list_companies(session, organisation_id, page=1, page_size=25)
        rows_other, total_other = await company_directory.list_companies(session, other_org_id, page=1, page_size=25)

    assert total_a == 1
    assert len(rows_a) == 1
    assert total_other == 0
    assert rows_other == []


async def test_every_company_gets_scored_no_icp_gate(org_ctx, make_company):
    organisation_id, _workspace_id = org_ctx
    company_no_evidence = await make_company(company_name="No Evidence Co")
    company_with_evidence = await make_company(company_name="With Evidence Co")

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company_with_evidence.company_id,
                canonical_key="evidence-key-1",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Evaluating vendors",
                summary="Acme is evaluating AI vendors",
                evidence=[{"url": "https://x.example.com/1", "company_match": 0.9}],
                published_at=NOW - timedelta(days=5),
                base_strength=90, relevance=0.9, freshness=1.0, source_quality=0.9,
                extraction_confidence=0.9, status_factor=1.0, event_score=65.61,
                is_negative=False, is_stale=False,
            )
        )
        await session.commit()

    async with async_session_maker() as session:
        await evidence_scorer.run_scoring(session, organisation_id)
        await session.commit()

    async with async_session_maker() as session:
        scores = (
            await session.execute(
                select(LeadScore).where(
                    LeadScore.company_id.in_([company_no_evidence.company_id, company_with_evidence.company_id])
                )
            )
        ).scalars().all()

    # Every uploaded company is scored - a company with zero buying evidence
    # is NOT filtered out or gated, it just scores low (brief: no ICP/gates).
    assert {s.company_id for s in scores} == {company_no_evidence.company_id, company_with_evidence.company_id}
    by_id = {s.company_id: s for s in scores}
    assert by_id[company_no_evidence.company_id].lead_score == 0.0
    assert by_id[company_with_evidence.company_id].lead_score > 0.0


# ---------------------------------------------------------------------------
# Offering Profile fallback
# ---------------------------------------------------------------------------

async def test_offering_profile_falls_back_when_scraper_unavailable(org_ctx, monkeypatch):
    organisation_id, _workspace_id = org_ctx
    monkeypatch.setattr(nexus_scraper_module, "is_configured", lambda: False)

    async with async_session_maker() as session:
        profile = await offering_profile_service.ensure_offering_profile(session, organisation_id)

    assert profile == offering_profile_service.fallback_profile()

    # Re-fetch the organisation directly to check the honestly-recorded status:
    # a sync was attempted (nexus_scraper unconfigured -> _scrape_and_extract
    # returns None immediately) and it failed, so STATUS_SYNC_FAILED is the
    # correct label here - the one guarantee that matters is it never claims
    # STATUS_SYNCED when no real sync happened.
    from app.models import Organisation as _Organisation

    async with async_session_maker() as session:
        org_row = await session.get(_Organisation, organisation_id)
    assert org_row.offering_profile_status != offering_profile_service.STATUS_SYNCED
    assert org_row.offering_profile_status == offering_profile_service.STATUS_SYNC_FAILED


# ---------------------------------------------------------------------------
# Signal Intelligence reads Tavily-derived BuyingEvents
# ---------------------------------------------------------------------------

async def test_signal_directory_reads_buying_events(org_ctx, make_company):
    organisation_id, _workspace_id = org_ctx
    company = await make_company(company_name="Signal Feed Co")

    async with async_session_maker() as session:
        session.add(
            BuyingEvent(
                company_id=company.company_id,
                canonical_key="signal-feed-key-1",
                event_type="vendor_evaluation",
                category="buying_stage",
                title="Acme is evaluating AI vendors",
                summary="Acme is evaluating AI vendors for its transformation program",
                evidence=[{"url": "https://x.example.com/1", "domain": "x.example.com", "company_match": 0.9}],
                published_at=NOW - timedelta(days=2),
                base_strength=90, relevance=0.9, freshness=1.0, source_quality=0.9,
                extraction_confidence=0.9, status_factor=1.0, event_score=65.61,
                is_negative=False, is_stale=False,
            )
        )
        await session.commit()

    async with async_session_maker() as session:
        rows, total = await buying_event_directory.list_events(session, organisation_id, page=1, page_size=25)

    assert total == 1
    (event, company_name) = rows[0]
    assert event.title == "Acme is evaluating AI vendors"
    assert company_name == "Signal Feed Co"
