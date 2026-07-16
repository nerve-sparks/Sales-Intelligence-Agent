from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.trigger_matcher import create_trigger, detect_trigger_events, get_trigger
from app.schemas.trigger import TriggerEventOut, TriggerEventsOut


class TriggerCreate(BaseModel):
    name: str | None = None
    signal_types: list[str] | None = None
    signal_categories: list[str] | None = None


async def create(workspace_id: UUID, payload: TriggerCreate, db: AsyncSession = Depends(get_db)):
    return await create_trigger(db, workspace_id, payload.model_dump())


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
