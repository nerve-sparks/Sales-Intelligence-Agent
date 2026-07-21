from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.controllers import signals as signals_controller
from app.models import Workspace
from app.services import llm_client
from app.services.trigger_matcher import create_trigger, detect_trigger_events, get_trigger, list_triggers
from app.schemas.trigger import TriggerEventOut, TriggerEventsOut, TriggerInsightOut


class TriggerCreate(BaseModel):
    name: str | None = None
    signal_types: list[str] | None = None
    signal_categories: list[str] | None = None


async def create(workspace_id: UUID, payload: TriggerCreate, db: AsyncSession = Depends(get_db)):
    return await create_trigger(db, workspace_id, payload.model_dump())


async def list_all(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    return await list_triggers(db, workspace_id)


async def insight(workspace_id: UUID, db: AsyncSession = Depends(get_db)):
    workspace = await db.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="workspace not found")

    triggers = await list_triggers(db, workspace_id)
    stats = await signals_controller.stats(workspace.organisation_id, db)

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
            generation_name="trigger-library-insight",
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

    matched = await detect_trigger_events(db, trigger)
    events_out = [
        TriggerEventOut(
            trigger_event_id=e.trigger_event_id,
            trigger_id=e.trigger_id,
            company_id=e.company_id,
            company_name=e.company.company_name,
            signal_id=e.signal_id,
            signal_type=e.signal.signal_type,
            signal_category=e.signal.signal_category,
            core_fact=e.signal.core_fact,
            notified=e.notified,
            detected_at=e.detected_at,
        )
        for e in matched
    ]
    return TriggerEventsOut(trigger=trigger, event_count=len(matched), events=events_out)
