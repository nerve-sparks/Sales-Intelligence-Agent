"""Refresh selected leads, the dashboard news tabs, competitor news and the
72-hour news scheduler.

External calls (web search, LLM) are monkeypatched; the database is real.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import delete, select, update

from app.controllers import companies as companies_controller
from app.core.config import get_settings
from app.core import scoring_config as cfg
from app.core.db import async_session_maker
from app.models import (
    AiMarketCompany,
    AiMarketNews,
    BuyingEvent,
    Company,
    CompetitorNews,
    Organisation,
    ScheduledJobRun,
)
from app.services import (
    ai_market_news_service,
    buying_event_directory,
    company_refresh_service,
    competitor_news_service,
    news_scheduler,
    workspace_service,
)
from app.schemas.company import CompanyRefreshIn

NOW = datetime.now(timezone.utc)


# ── refresh selected ──────────────────────────────────────────────────────


async def test_queue_skips_other_workspaces_and_companies_already_refreshing(org_ctx, make_company):
    organisation_id, workspace_id = org_ctx
    a, b = await make_company(), await make_company()
    async with async_session_maker() as session:
        other_ws = await workspace_service.create_workspace(session, organisation_id, {"workspace_name": "other"})
        foreign = Company(organisation_id=organisation_id, workspace_id=other_ws.workspace_id,
                          zi_company_id=uuid.uuid4().int % 10**9, company_name="Elsewhere")
        session.add(foreign)
        await session.execute(update(Company).where(Company.company_id == b.company_id).values(refresh_status="running"))
        await session.commit()
        accepted, skipped, cooling = await company_refresh_service.queue_refresh(
            session, workspace_id, [a.company_id, b.company_id, foreign.company_id]
        )
    assert accepted == [a.company_id]
    assert set(skipped) == {b.company_id, foreign.company_id}
    assert cooling == {}


async def test_successful_refresh_starts_a_48h_cooldown_but_a_failed_one_does_not(org_ctx, make_company):
    _org, workspace_id = org_ctx
    recent_ok, old_ok, recent_failed = await make_company(), await make_company(), await make_company()
    async with async_session_maker() as session:
        for company, status, hours_ago in (
            (recent_ok, "done", 10), (old_ok, "done", 49), (recent_failed, "failed", 1),
        ):
            await session.execute(update(Company).where(Company.company_id == company.company_id).values(
                refresh_status=status, refresh_requested_at=NOW - timedelta(hours=hours_ago)))
        await session.commit()
        ids = [recent_ok.company_id, old_ok.company_id, recent_failed.company_id]
        accepted, skipped, cooling = await company_refresh_service.queue_refresh(session, workspace_id, ids)

    assert accepted == [old_ok.company_id, recent_failed.company_id] and skipped == []
    assert list(cooling) == [recent_ok.company_id]
    expected = NOW - timedelta(hours=10) + timedelta(hours=48)
    assert abs((cooling[recent_ok.company_id] - expected).total_seconds()) < 1


async def test_refresh_response_reports_the_cooldown(org_ctx, make_company):
    organisation_id, workspace_id = org_ctx
    company = await make_company()
    async with async_session_maker() as session:
        await session.execute(update(Company).where(Company.company_id == company.company_id).values(
            refresh_status="done", refresh_requested_at=NOW - timedelta(hours=1)))
        await session.commit()
    out, tasks = await _call_refresh(organisation_id, workspace_id, [company.company_id])
    assert out.accepted == [] and tasks.tasks == []
    assert [c.company_id for c in out.cooling_down] == [company.company_id] and out.cooldown_hours == 48


async def _call_refresh(organisation_id, workspace_id, ids):
    async with async_session_maker() as session:
        tasks = BackgroundTasks()
        out = await companies_controller.refresh(organisation_id, workspace_id, CompanyRefreshIn(company_ids=ids), tasks, session)
        return out, tasks


async def test_refresh_endpoint_limits_and_scopes(org_ctx, make_company):
    organisation_id, workspace_id = org_ctx
    with pytest.raises(HTTPException) as exc:
        await _call_refresh(organisation_id, workspace_id, [uuid.uuid4() for _ in range(26)])
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException) as exc:
        await _call_refresh(organisation_id, workspace_id, [])
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException) as exc:
        await _call_refresh(uuid.uuid4(), workspace_id, [uuid.uuid4()])
    assert exc.value.status_code == 404

    company = await make_company()
    out, tasks = await _call_refresh(organisation_id, workspace_id, [company.company_id])
    assert out.accepted == [company.company_id] and out.skipped == []
    assert len(tasks.tasks) == 1 and tasks.tasks[0].args[2] == [company.company_id]


async def test_background_refresh_marks_each_company_done_or_failed(org_ctx, make_company, monkeypatch):
    organisation_id, workspace_id = org_ctx
    ok, bad = await make_company(), await make_company()
    researched, scored = [], []

    async def fake_research(session, org_id, ws_id, company_ids=None, force_refresh=False, import_batch_id=None):
        researched.append((list(company_ids), force_refresh, import_batch_id))
        # Only `ok` succeeds: research stamps search_signals_fetched_at on success.
        await session.execute(update(Company).where(Company.company_id == ok.company_id)
                              .values(search_signals_fetched_at=datetime.now(timezone.utc)))
        await session.commit()
        return {}

    async def fake_scoring(session, ws_id, company_ids=None, import_batch_id=None):
        scored.append(list(company_ids))
        return {}

    async def fake_profile(session, org_id):
        return {}

    monkeypatch.setattr(company_refresh_service.search_signal_ingest, "research_companies", fake_research)
    monkeypatch.setattr(company_refresh_service.evidence_scorer, "run_scoring", fake_scoring)
    monkeypatch.setattr(company_refresh_service, "ensure_offering_profile", fake_profile)

    ids = [ok.company_id, bad.company_id]
    async with async_session_maker() as session:
        await company_refresh_service.queue_refresh(session, workspace_id, ids)
    await company_refresh_service.refresh_companies_in_background(organisation_id, workspace_id, ids)

    assert researched == [(ids, True, None)] and scored == [ids]
    async with async_session_maker() as session:
        status = dict((await session.execute(
            select(Company.company_id, Company.refresh_status).where(Company.company_id.in_(ids))
        )).all())
    assert status == {ok.company_id: "done", bad.company_id: "failed"}


# ── dashboard news tabs ───────────────────────────────────────────────────


async def _event(company_id, event_type, *, is_negative=False, published=NOW - timedelta(days=2), **over):
    values = dict(
        company_id=company_id, canonical_key=f"news-{uuid.uuid4().hex[:12]}", event_type=event_type,
        category="buying_stage", title=event_type, summary=event_type,
        evidence=[{"url": f"https://n.example.com/{uuid.uuid4().hex[:6]}"}], published_at=published,
        base_strength=50, relevance=0.8, freshness=1.0, source_quality=0.8, extraction_confidence=0.9,
        status_factor=1.0, event_score=30, is_negative=is_negative, is_stale=False,
        penalty_value=70 if is_negative else None,
    )
    values.update(over)
    async with async_session_maker() as session:
        session.add(BuyingEvent(**values))
        await session.commit()


async def _types(workspace_id, **kwargs):
    async with async_session_maker() as session:
        rows, _ = await buying_event_directory.list_events(session, workspace_id, 1, 100, **kwargs)
    return sorted(e.event_type for e, _name in rows)


async def test_news_groups_pick_the_right_events(org_ctx, make_company):
    _org, workspace_id = org_ctx
    company = await make_company()
    await _event(company.company_id, "rfp_published")
    await _event(company.company_id, "funding_without_buying_evidence")
    await _event(company.company_id, "leadership_change")
    await _event(company.company_id, "company_identity_update")
    await _event(company.company_id, cfg.VENDOR_SELECTED_EVENT_TYPE, is_negative=True)
    await _event(company.company_id, cfg.COMPETITOR_EVENT_TYPE, is_negative=True)
    await _event(company.company_id, "vendor_evaluation", is_negative=True)  # project_cancelled-style

    assert await _types(workspace_id, group="buying_signals") == ["rfp_published"]
    assert await _types(workspace_id, group="funding_budget") == ["funding_without_buying_evidence"]
    assert await _types(workspace_id, group="leadership") == ["leadership_change"]
    assert await _types(workspace_id, group="competitor_at_prospect") == [cfg.VENDOR_SELECTED_EVENT_TYPE]
    assert await _types(workspace_id, group="all") == sorted([
        "rfp_published", "funding_without_buying_evidence", "leadership_change", cfg.VENDOR_SELECTED_EVENT_TYPE,
    ])
    # The ordinary feed still never shows negatives.
    assert cfg.VENDOR_SELECTED_EVENT_TYPE not in await _types(workspace_id)


async def test_recent_days_uses_article_date_else_discovery_date(org_ctx, make_company):
    _org, workspace_id = org_ctx
    company = await make_company()
    await _event(company.company_id, "rfp_published", published=NOW - timedelta(days=5))
    await _event(company.company_id, "leadership_change", published=NOW - timedelta(days=40))
    await _event(company.company_id, "active_pilot", published=None)  # undated, found just now
    await _event(company.company_id, "vendor_evaluation", published=NOW + timedelta(days=200))  # bad date

    assert await _types(workspace_id, group="all", recent_days=30) == ["active_pilot", "rfp_published"]


async def test_sort_discovered_puts_newest_found_first(org_ctx, make_company):
    _org, workspace_id = org_ctx
    company = await make_company()
    await _event(company.company_id, "rfp_published", published=NOW - timedelta(days=1),
                 created_at=NOW - timedelta(days=3))
    await _event(company.company_id, "active_pilot", published=None)
    async with async_session_maker() as session:
        rows, _ = await buying_event_directory.list_events(session, workspace_id, 1, 10, sort="discovered")
    assert [e.event_type for e, _ in rows] == ["active_pilot", "rfp_published"]


async def test_sort_newest_orders_by_news_date_not_by_when_it_was_researched(org_ctx, make_company):
    """The dashboard bug: sorting by discovery let the most recently researched
    companies crowd out newer news about companies researched earlier."""
    _org, workspace_id = org_ctx
    earlier_researched, just_researched = await make_company(), await make_company()
    await _event(earlier_researched.company_id, "rfp_published", published=NOW - timedelta(days=1),
                 created_at=NOW - timedelta(days=20))
    await _event(just_researched.company_id, "leadership_change", published=NOW - timedelta(days=15))
    await _event(just_researched.company_id, "active_pilot", published=None,
                 created_at=NOW - timedelta(days=3))  # undated: falls back to when it was found
    async with async_session_maker() as session:
        rows, _ = await buying_event_directory.list_events(session, workspace_id, 1, 10, sort="newest")
    assert [e.event_type for e, _ in rows] == ["rfp_published", "active_pilot", "leadership_change"]


# ── competitor news ───────────────────────────────────────────────────────


def _patch_external(monkeypatch, search_results, llm_reply):
    async def fake_search(domain, name, *a, **k):
        return search_results.get(name, [])

    async def fake_complete(*_a, **_k):
        if isinstance(llm_reply, Exception):
            raise llm_reply
        return llm_reply

    monkeypatch.setattr(competitor_news_service.you_client, "search", fake_search)
    monkeypatch.setattr(competitor_news_service.you_client, "is_configured", lambda: True)
    monkeypatch.setattr(competitor_news_service.llm_client, "complete", fake_complete)
    monkeypatch.setattr(competitor_news_service.llm_client, "is_configured", lambda: True)


async def _set_competitors(organisation_id, competitors):
    async with async_session_maker() as session:
        await session.execute(update(Organisation).where(Organisation.organisation_id == organisation_id)
                              .values(competitors=competitors))
        await session.commit()


async def _stored(organisation_id):
    async with async_session_maker() as session:
        return (await session.execute(
            select(CompetitorNews).where(CompetitorNews.organisation_id == organisation_id)
        )).scalars().all()


async def test_competitor_news_is_collected_filtered_and_kept_on_failure(org_ctx, monkeypatch):
    organisation_id, _ws = org_ctx
    await _set_competitors(organisation_id, [{"name": "Rival Labs", "domain": "rivallabs.com"}])
    results = {"Rival Labs": [
        {"link": "https://news.example.com/rival-funding", "title": "Rival Labs raises $50M",
         "snippet": "Rival Labs raised", "date": (NOW - timedelta(days=2)).isoformat()},
        {"link": "https://news.example.com/celebrity", "title": "Celebrity gossip", "snippet": "nothing", "date": None},
        {"link": "https://news.example.com/rival-profile", "title": "Rival Labs company profile",
         "snippet": "Rival Labs overview", "date": None},
    ]}
    reply = ('[{"index":0,"is_news":true,"category":"funding","summary":"Raised $50M",'
             '"why_it_matters":"Expect them to push harder in deals"},{"index":1,"is_news":false}]')
    _patch_external(monkeypatch, results, reply)

    async with async_session_maker() as session:
        summary = await competitor_news_service.refresh_competitor_news(session, organisation_id)
    rows = await _stored(organisation_id)
    assert summary["stored"] == 1 and len(rows) == 1
    assert (rows[0].category, rows[0].competitor_name, rows[0].why_it_matters) == (
        "funding", "Rival Labs", "Expect them to push harder in deals")

    # An LLM failure must not wipe what we already have.
    _patch_external(monkeypatch, results, RuntimeError("429 budget exceeded"))
    async with async_session_maker() as session:
        summary = await competitor_news_service.refresh_competitor_news(session, organisation_id)
    assert summary["failed"] == 1 and len(await _stored(organisation_id)) == 1


async def test_competitor_news_older_than_a_month_is_deleted(org_ctx, monkeypatch):
    organisation_id, _ws = org_ctx
    async with async_session_maker() as session:
        for days, url in ((40, "https://x.com/old"), (5, "https://x.com/new")):
            session.add(CompetitorNews(organisation_id=organisation_id, competitor_name="R", title="t", url=url,
                                       published_at=NOW - timedelta(days=days), discovered_at=NOW - timedelta(days=days)))
        await session.commit()
    _patch_external(monkeypatch, {}, "[]")
    async with async_session_maker() as session:
        await competitor_news_service.refresh_competitor_news(session, organisation_id)
    assert [r.url for r in await _stored(organisation_id)] == ["https://x.com/new"]


async def test_no_competitors_is_a_no_op(org_ctx, monkeypatch):
    organisation_id, _ws = org_ctx
    _patch_external(monkeypatch, {}, "[]")
    async with async_session_maker() as session:
        summary = await competitor_news_service.refresh_competitor_news(session, organisation_id)
    assert summary == {"competitors": 0, "stored": 0, "failed": 0, "purged": 0}


# ── 48h scheduler ─────────────────────────────────────────────────────────


async def test_global_job_claim_runs_once_per_window():
    job = f"pytest-job-{uuid.uuid4().hex[:8]}"
    interval = get_settings().news_refresh_interval_hours
    assert interval == 72
    try:
        async with async_session_maker() as session:
            assert await news_scheduler.claim_due_job(session, job, NOW)
            assert not await news_scheduler.claim_due_job(session, job, NOW + timedelta(hours=interval - 1))
            assert await news_scheduler.claim_due_job(session, job, NOW + timedelta(hours=interval + 1))
            assert await news_scheduler.last_run_at(session, job) == NOW + timedelta(hours=interval + 1)
    finally:
        async with async_session_maker() as session:
            await session.execute(delete(ScheduledJobRun).where(ScheduledJobRun.job_key == job))
            await session.commit()


# ── top-50 AI company news ────────────────────────────────────────────────


@pytest.fixture
async def clean_ai_market():
    """The AI market tables are global and these tests run against the real
    database, so each test starts empty - and the rows that were there before
    (real fetched news) are put back afterwards instead of being lost."""
    def snapshot(rows, model):
        return [{c.name: getattr(r, c.name) for c in model.__table__.columns} for r in rows]

    async with async_session_maker() as session:
        saved_companies = snapshot((await session.execute(select(AiMarketCompany))).scalars().all(), AiMarketCompany)
        saved_news = snapshot((await session.execute(select(AiMarketNews))).scalars().all(), AiMarketNews)
        await session.execute(delete(AiMarketNews))
        await session.execute(delete(AiMarketCompany))
        await session.commit()
    try:
        yield
    finally:
        async with async_session_maker() as session:
            await session.execute(delete(AiMarketNews))
            await session.execute(delete(AiMarketCompany))
            session.add_all([AiMarketCompany(**row) for row in saved_companies])
            session.add_all([AiMarketNews(**row) for row in saved_news])
            await session.commit()


def _patch_ai_market(monkeypatch, discovery_reply, news_results, news_reply):
    async def fake_search_query(query, *a, **k):
        return [{"link": "https://x.com/list", "title": "Top AI companies", "snippet": "OpenAI, Anthropic"}]

    async def fake_search(domain, name, *a, **k):
        return news_results.get(name, [])

    async def fake_complete(messages, generation_name=None, **_k):
        reply = discovery_reply if generation_name == "discover-top-ai-companies" else news_reply
        if isinstance(reply, Exception):
            raise reply
        return reply

    svc = ai_market_news_service
    monkeypatch.setattr(svc.you_client, "search_query", fake_search_query)
    monkeypatch.setattr(svc.you_client, "search", fake_search)
    monkeypatch.setattr(svc.you_client, "is_configured", lambda: True)
    monkeypatch.setattr(svc.llm_client, "complete", fake_complete)
    monkeypatch.setattr(svc.llm_client, "is_configured", lambda: True)


def _discovery(n):
    import json as _json
    return _json.dumps([{"name": f"AI Co {i}", "domain": f"aico{i}.com"} for i in range(n)])


async def test_ai_news_is_collected_categorised_and_filtered(clean_ai_market, monkeypatch):
    results = {"AI Co 0": [
        {"link": "https://news.example.com/aico0-model", "title": "AI Co 0 launches new model",
         "snippet": "AI Co 0 released", "date": (NOW - timedelta(days=1)).isoformat()},
        {"link": "https://news.example.com/aico0-round", "title": "AI Co 0 raises $2B",
         "snippet": "AI Co 0 funding", "date": (NOW - timedelta(days=3)).isoformat()},
        {"link": "https://news.example.com/aico0-old", "title": "AI Co 0 old deal",
         "snippet": "AI Co 0 deal", "date": (NOW - timedelta(days=60)).isoformat()},
        {"link": "https://news.example.com/gossip", "title": "Celebrity gossip", "snippet": "none", "date": None},
    ]}
    reply = ('[{"index":0,"is_news":true,"category":"product_launch","summary":"New model"},'
             '{"index":1,"is_news":true,"category":"funding","summary":"Raised $2B"},'
             '{"index":2,"is_news":true,"category":"buying_signal","summary":"Old deal"}]')
    _patch_ai_market(monkeypatch, _discovery(50), results, reply)

    async with async_session_maker() as session:
        summary = await ai_market_news_service.refresh_ai_market_news(session)
        companies = await ai_market_news_service.stored_companies(session)
        everything = await ai_market_news_service.list_news(session, 30, 10)
        funding = await ai_market_news_service.list_news(session, 30, 10, "funding")
    assert summary["companies"] == 50 and len(companies) == 50 and companies[0]["name"] == "AI Co 0"
    assert [n.category for n in everything] == ["product_launch", "funding"]  # newest first; 60-day item dropped
    assert [n.title for n in funding] == ["AI Co 0 raises $2B"]

    async with async_session_maker() as session:
        page_2 = await ai_market_news_service.list_news(session, 30, 1, offset=1)
        total = await ai_market_news_service.count_news(session, 30)
    assert [n.category for n in page_2] == ["funding"] and total == 2


async def test_failed_list_rebuild_keeps_the_previous_list(clean_ai_market, monkeypatch):
    _patch_ai_market(monkeypatch, _discovery(50), {}, "[]")
    async with async_session_maker() as session:
        await ai_market_news_service.refresh_ai_market_news(session)
    _patch_ai_market(monkeypatch, RuntimeError("429 budget exceeded"), {}, "[]")
    async with async_session_maker() as session:
        summary = await ai_market_news_service.refresh_ai_market_news(session)
        assert len(await ai_market_news_service.stored_companies(session)) == 50
    assert summary["companies"] == 50


async def test_ai_news_older_than_a_month_is_deleted(clean_ai_market, monkeypatch):
    async with async_session_maker() as session:
        for days, url in ((40, "https://x.com/old"), (5, "https://x.com/new")):
            session.add(AiMarketNews(company_name="AI Co", title="t", category="funding", url=url,
                                     published_at=NOW - timedelta(days=days), discovered_at=NOW - timedelta(days=days)))
        await session.commit()
    _patch_ai_market(monkeypatch, RuntimeError("down"), {}, "[]")
    async with async_session_maker() as session:
        await ai_market_news_service.refresh_ai_market_news(session)
        urls = [n.url for n in await ai_market_news_service.list_news(session, 365, 10)]
    assert urls == ["https://x.com/new"]
