from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.trigger_matcher import create_trigger, detect_trigger_events, get_trigger
from app.views.trigger_view import serialize_trigger, serialize_trigger_event


class TriggerCreate(BaseModel):
    name: str | None = None
    signal_types: list[str] | None = None
    signal_categories: list[str] | None = None


async def create(workspace_id: UUID, payload: TriggerCreate, db: AsyncSession = Depends(get_db)):
    trigger = await create_trigger(db, workspace_id, payload.model_dump())
    return serialize_trigger(trigger)


async def events(workspace_id: UUID, trigger_id: UUID, db: AsyncSession = Depends(get_db)):
    trigger = await get_trigger(db, workspace_id, trigger_id)
    if trigger is None:
        raise HTTPException(status_code=404, detail="trigger not found")

    matched = await detect_trigger_events(db, trigger)
    return {
        "trigger": serialize_trigger(trigger),
        "event_count": len(matched),
        "events": [serialize_trigger_event(e) for e in matched],
    }
