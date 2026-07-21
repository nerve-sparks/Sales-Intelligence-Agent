from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TriggerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trigger_id: UUID
    name: str | None = None
    signal_types: list[str] | None = None
    signal_categories: list[str] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TriggerEventOut(BaseModel):
    trigger_event_id: UUID
    trigger_id: UUID
    company_id: UUID
    company_name: str
    signal_id: UUID
    signal_type: str
    signal_category: str
    core_fact: str | None = None
    notified: bool
    detected_at: datetime | None = None


class TriggerEventsOut(BaseModel):
    trigger: TriggerOut
    event_count: int
    events: list[TriggerEventOut]


class TriggerInsightOut(BaseModel):
    summary: str
