from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.controllers import signals as signals_controller
from app.models import Workspace
from app.services import llm_client
from app.services.trigger_matcher import (
    create_trigger,
    delete_trigger,
    detect_trigger_events,
    get_trigger,
    list_triggers,
    mark_trigger_seen,
)
from app.schemas.trigger import TriggerEventOut, TriggerEventsOut, TriggerInsightOut


class TriggerCreate(BaseModel):
    """Criteria are BuyingEvent.category values + a minimum real event_score -
    the same values the scoring pipeline computes. signal_types is gone; see
    trigger_matcher's module docstring and migration b8e3d1f7a2c9."""

    name: str | None = None
    signal_categories: list[str] | None = None
    min_event_score: float = 0


async def create(workspace_id: UUID, payload: TriggerCreate, db: AsyncSession = Depends(get_db)):
    return await create_trigger(db, workspace_id, payload.model_dump())


async def remove(workspace_id: UUID, trigger_id: UUID, db: AsyncSession = Depends(get_db)):
    if not await delete_trigger(db, workspace_id, trigger_id):
        raise HTTPException(status_code=404, detail="trigger not found")
    return {"deleted": True}


async def mark_seen(workspace_id: UUID, trigger_id: UUID, db: AsyncSession = Depends(get_db)):
    """Clears this trigger's "new matches" badge. Separate from GET .../events
    on purpose - Trigger Library fetches events for every trigger just to show
    counts, so clearing there would wipe every badge on page load."""
    if not await mark_trigger_seen(db, workspace_id, trigger_id):
        raise HTTPException(status_code=404, detail="trigger not found")
    return {"marked_seen": True}


async def list_all(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return await list_triggers(db, workspace_id)


async def insight(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    triggers = await list_triggers(db, workspace_id)
    stats = await signals_controller.stats(workspace.organisation_id, db=db)

    if stats.total == 0:
        return TriggerInsightOut(summary="No signals yet - upload a ZoomInfo export to start matching triggers.")

    category_summary = [
        {"category": c.signal_category, "count": c.count, "companies": c.company_count}
        for c in stats.by_category
    ]
    trigger_names = [t.name for t in triggers if t.name]

    prompt = (
        "You are a sales intelligence assistant summarizing signal-category performance for a sales leader. "
        f"Data: {stats.total} total signals across {stats.company_count} companies, average confidence "
        f"{round((stats.avg_confidence or 0) * 100)}%. Breakdown by category: {category_summary}. "
        f"Triggers currently saved: {trigger_names or 'none yet'}. "
        "Write a 2-3 sentence, plain-English summary of which signal categories matter most right now and what "
        "trigger the sales team should consider creating next. Reference the actual numbers. No preamble, no markdown."
    )

    try:
        summary = await llm_client.complete(
            [{"role": "user", "content": prompt}],
            generation_name="generate-trigger-insight",
            trace_user_id=str(workspace_id),
        )
    except llm_client.LLMNotConfiguredError:
        top = max(stats.by_category, key=lambda c: c.count) if stats.by_category else None
        summary = f"{stats.total} signals across {stats.company_count} companies."
        if top:
            summary += f" {top.signal_category.replace('_', ' ').title()} has the most activity ({top.count} signals)."

    return TriggerInsightOut(summary=summary)


async def events(workspace_id: UUID, trigger_id: UUID, db: AsyncSession = Depends(get_db)):
    trigger = await get_trigger(db, workspace_id, trigger_id)
    if trigger is None:
        raise HTTPException(status_code=404, detail="trigger not found")

    matched, new_count = await detect_trigger_events(db, trigger)
    # The newest `new_count` matches (the list is already detected_at-desc) are
    # exactly the ones past the last_seen_at watermark - flagged per row so the
    # UI can mark them without recomputing the comparison client-side.
    events_out = [
        TriggerEventOut(
            trigger_event_id=e.trigger_event_id,
            trigger_id=e.trigger_id,
            company_id=e.company_id,
            company_name=e.company.company_name,
            buying_event_id=e.buying_event_id,
            event_type=e.buying_event.event_type,
            category=e.buying_event.category,
            title=e.buying_event.title,
            summary=e.buying_event.summary,
            event_score=float(e.buying_event.event_score) if e.buying_event.event_score is not None else None,
            published_at=e.buying_event.published_at,
            is_new=i < new_count,
            notified=e.notified,
            detected_at=e.detected_at,
        )
        for i, e in enumerate(matched)
    ]
    return TriggerEventsOut(
        trigger=trigger,
        event_count=len(matched),
        new_event_count=new_count,
        company_count=len({e.company_id for e in matched}),
        events=events_out,
    )
