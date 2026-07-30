"""Trigger matching against the evidence pipeline (BuyingEvent).

These exist because triggers were silently broken with zero coverage: the
matcher queried the legacy `signal` table, which nothing populates anymore,
so every trigger matched zero recent events and nothing failed loudly. The
first test below is the regression guard for exactly that - it would have
caught it, since it asserts a trigger finds a BuyingEvent.
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.db import async_session_maker
from app.models import BuyingEvent, TriggerEvent
from app.services import trigger_matcher

NOW = datetime.now(timezone.utc)


async def _add_event(company_id, **overrides) -> BuyingEvent:
    """A scored, live, positive BuyingEvent - the shape a trigger should match
    unless a test overrides one of those properties."""
    values = dict(
        company_id=company_id,
        canonical_key=f"trigger-test-{uuid.uuid4().hex[:12]}",
        event_type="vendor_evaluation",
        category="buying_stage",
        title="Acme evaluating AI vendors",
        summary="Acme is evaluating AI vendors",
        evidence=[{"url": f"https://x.example.com/{uuid.uuid4().hex[:6]}", "company_match": 0.9}],
        published_at=NOW - timedelta(days=3),
        base_strength=70, relevance=0.9, freshness=1.0, source_quality=0.82,
        extraction_confidence=0.9, status_factor=1.0, event_score=46.49,
        is_negative=False, is_stale=False,
    )
    values.update(overrides)
    async with async_session_maker() as session:
        event = BuyingEvent(**values)
        session.add(event)
        await session.commit()
        await session.refresh(event)
        return event


async def test_trigger_matches_buying_events_not_legacy_signals(org_ctx, make_company):
    """The regression guard: a category trigger must find a real BuyingEvent.

    Before triggers were repointed, this matched the `signal` table and found
    nothing, with no error - the whole feature was quietly inert.
    """
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    event = await _add_event(company.company_id)

    async with async_session_maker() as session:
        trigger = await trigger_matcher.create_trigger(
            session, workspace_id, {"name": "Buying Stage", "signal_categories": ["buying_stage"], "min_event_score": 0}
        )
        matched, new_count = await trigger_matcher.detect_trigger_events(session, trigger)

    assert [e.buying_event_id for e in matched] == [event.buying_event_id]
    # Never viewed (last_seen_at is NULL) -> every match counts as new.
    assert new_count == 1


async def test_min_event_score_excludes_weaker_events(org_ctx, make_company):
    """min_event_score gates on the REAL event_score, so a weak event in a
    matching category is excluded - this is what makes a trigger precise
    rather than firing on every mention."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    strong = await _add_event(company.company_id, event_score=46.49)
    await _add_event(company.company_id, event_score=8.0)

    async with async_session_maker() as session:
        trigger = await trigger_matcher.create_trigger(
            session, workspace_id, {"name": "Strong only", "signal_categories": ["buying_stage"], "min_event_score": 20},
        )
        matched, _new = await trigger_matcher.detect_trigger_events(session, trigger)

    assert [e.buying_event_id for e in matched] == [strong.buying_event_id]


async def test_stale_and_negative_events_never_match(org_ctx, make_company):
    """Mirrors the scoring pipeline's own exclusions: a trigger must not alert
    on evidence the Lead Score itself ignores (evidence_scorer drops stale
    events; negative events are disqualifiers, not signals to chase)."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    await _add_event(company.company_id, is_stale=True)
    await _add_event(company.company_id, is_negative=True, penalty_value=50)

    async with async_session_maker() as session:
        trigger = await trigger_matcher.create_trigger(
            session, workspace_id, {"name": "Live positives", "signal_categories": ["buying_stage"], "min_event_score": 0},
        )
        matched, new_count = await trigger_matcher.detect_trigger_events(session, trigger)

    assert matched == []
    assert new_count == 0


async def test_trigger_with_no_categories_matches_nothing(org_ctx, make_company):
    """A half-configured rule must be visibly inert, not silently match the
    whole organisation."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    await _add_event(company.company_id)

    async with async_session_maker() as session:
        trigger = await trigger_matcher.create_trigger(
            session, workspace_id, {"name": "Empty", "signal_categories": None, "min_event_score": 0}
        )
        matched, _new = await trigger_matcher.detect_trigger_events(session, trigger)

    assert matched == []


async def test_mark_seen_clears_new_count_without_dropping_matches(org_ctx, make_company):
    """Viewing a trigger clears its "new" badge but keeps the matches - and a
    later event becomes new again, which is what makes this alerting rather
    than a one-shot count."""
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    await _add_event(company.company_id)

    async with async_session_maker() as session:
        trigger = await trigger_matcher.create_trigger(
            session, workspace_id, {"name": "Watch", "signal_categories": ["buying_stage"], "min_event_score": 0}
        )
        _matched, new_count = await trigger_matcher.detect_trigger_events(session, trigger)
        assert new_count == 1

        await trigger_matcher.mark_trigger_seen(session, workspace_id, trigger.trigger_id)

    async with async_session_maker() as session:
        seen_trigger = await trigger_matcher.get_trigger(session, workspace_id, trigger.trigger_id)
        matched_after, new_after = await trigger_matcher.detect_trigger_events(session, seen_trigger)

    assert len(matched_after) == 1, "marking seen must not drop existing matches"
    assert new_after == 0


async def test_deleting_trigger_removes_its_events(org_ctx, make_company):
    _organisation_id, workspace_id = org_ctx
    company = await make_company()
    await _add_event(company.company_id)

    async with async_session_maker() as session:
        trigger = await trigger_matcher.create_trigger(
            session, workspace_id, {"name": "Temp", "signal_categories": ["buying_stage"], "min_event_score": 0}
        )
        await trigger_matcher.detect_trigger_events(session, trigger)
        assert await trigger_matcher.delete_trigger(session, workspace_id, trigger.trigger_id) is True

    async with async_session_maker() as session:
        remaining = (
            await session.execute(
                select(TriggerEvent).where(TriggerEvent.trigger_id == trigger.trigger_id)
            )
        ).scalars().all()
    assert remaining == []
