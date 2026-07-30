"""Trigger matching over the evidence pipeline's BuyingEvents.

A trigger is a saved alerting rule: "tell me when a company produces a
buying event in these categories, scoring at least this much". Matching is
deliberately built on the SAME values the scoring pipeline computes, never a
parallel vocabulary or a second notion of importance:

  - trigger.signal_categories  -> BuyingEvent.category (the six real category
    values the extraction prompt emits, see buying_event_service._build_prompt)
  - trigger.min_event_score    -> BuyingEvent.event_score (the real product of
    base_strength x relevance x freshness x source_quality x
    extraction_confidence x status_factor, see compute_event_score)

and it applies the same exclusions the scorer applies, so a trigger can never
alert on something the Lead Score itself ignores:

  - is_stale=False    -> evidence_scorer.score_company drops stale events from
    the live score (an event not rediscovered by the latest research run)
  - is_negative=False -> negative events are disqualifiers surfaced via Score
    Breakdown, not "signals" to chase (same rule as buying_event_directory's
    read queries)

This replaced matching against the legacy `signal` table, which nothing
populates anymore - see the b8e3d1f7a2c9 migration for the full history.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import BuyingEvent, Company, TriggerDefinition, TriggerEvent, Workspace


async def create_trigger(session: AsyncSession, workspace_id: UUID, values: dict) -> TriggerDefinition:
    trigger = TriggerDefinition(workspace_id=workspace_id, **values)
    session.add(trigger)
    await session.commit()
    await session.refresh(trigger)
    return trigger


async def get_trigger(session: AsyncSession, workspace_id: UUID, trigger_id: UUID) -> TriggerDefinition | None:
    stmt = select(TriggerDefinition).where(
        TriggerDefinition.trigger_id == trigger_id, TriggerDefinition.workspace_id == workspace_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_triggers(session: AsyncSession, workspace_id: UUID) -> list[TriggerDefinition]:
    stmt = (
        select(TriggerDefinition)
        .where(TriggerDefinition.workspace_id == workspace_id)
        .order_by(TriggerDefinition.created_at.desc())
    )
    return (await session.execute(stmt)).scalars().all()


async def delete_trigger(session: AsyncSession, workspace_id: UUID, trigger_id: UUID) -> bool:
    trigger = await get_trigger(session, workspace_id, trigger_id)
    if trigger is None:
        return False
    await session.delete(trigger)
    await session.commit()
    return True


async def mark_trigger_seen(session: AsyncSession, workspace_id: UUID, trigger_id: UUID) -> bool:
    """Moves the alerting watermark to now, so currently-matched events stop
    counting as "new". Called when the user actually views a trigger's matches
    (Trigger Detail), NOT by detect_trigger_events itself - Trigger Library
    calls detect for every trigger just to render counts, and doing this there
    would clear every badge the moment the page loaded."""
    trigger = await get_trigger(session, workspace_id, trigger_id)
    if trigger is None:
        return False
    await session.execute(
        update(TriggerDefinition)
        .where(TriggerDefinition.trigger_id == trigger_id)
        .values(last_seen_at=datetime.now(timezone.utc))
    )
    await session.commit()
    return True


async def detect_trigger_events(
    session: AsyncSession, trigger: TriggerDefinition
) -> tuple[list[TriggerEvent], int]:
    """Upserts a TriggerEvent for every BuyingEvent matching this trigger, then
    returns (all matches newest-first, count of matches newer than
    last_seen_at). The new-count is the alerting signal the UI badges.

    A trigger with no categories selected matches nothing - deliberately, so an
    empty/half-configured rule is visibly inert rather than silently matching
    the entire organisation.
    """
    # A trigger's Workspace belongs to exactly one Organisation - buying events
    # are shared across all Workspaces in that Organisation (same as company
    # data), so scope by organisation_id (via the workspace), not workspace_id.
    workspace = await session.get(Workspace, trigger.workspace_id)

    if trigger.signal_categories:
        min_score = float(trigger.min_event_score or 0)
        matching = (
            await session.execute(
                select(BuyingEvent.buying_event_id, BuyingEvent.company_id)
                .join(Company, Company.company_id == BuyingEvent.company_id)
                .where(
                    Company.organisation_id == workspace.organisation_id,
                    BuyingEvent.category.in_(trigger.signal_categories),
                    BuyingEvent.event_score >= min_score,
                    # Same exclusions the Lead Score applies - see module docstring.
                    BuyingEvent.is_stale.is_(False),
                    BuyingEvent.is_negative.is_(False),
                )
            )
        ).all()
        for buying_event_id, company_id in matching:
            await session.execute(
                pg_insert(TriggerEvent)
                .values(trigger_id=trigger.trigger_id, buying_event_id=buying_event_id, company_id=company_id)
                .on_conflict_do_nothing(index_elements=["trigger_id", "buying_event_id"])
            )
        await session.commit()

    stmt = (
        select(TriggerEvent)
        .where(TriggerEvent.trigger_id == trigger.trigger_id)
        .options(selectinload(TriggerEvent.company), selectinload(TriggerEvent.buying_event))
        .order_by(TriggerEvent.detected_at.desc())
    )
    events = list((await session.execute(stmt)).scalars().all())

    if trigger.last_seen_at is None:
        new_count = len(events)
    else:
        last_seen = trigger.last_seen_at
        if isinstance(last_seen, datetime) and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        new_count = sum(
            1 for e in events if e.detected_at is not None and e.detected_at > last_seen
        )

    return events, new_count
