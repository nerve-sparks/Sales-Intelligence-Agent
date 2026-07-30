from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TriggerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    trigger_id: UUID
    name: str | None = None
    # BuyingEvent.category values + the minimum real event_score a match must
    # reach - see trigger_matcher's module docstring. The old signal_types
    # field is gone: it matched a vocabulary the evidence pipeline never
    # produces (migration b8e3d1f7a2c9).
    signal_categories: list[str] | None = None
    min_event_score: float = 0
    last_seen_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TriggerEventOut(BaseModel):
    """One matched BuyingEvent. Carries the same scoring fields Score
    Breakdown shows for that event, so a trigger match stays auditable against
    the Lead Score instead of being an opaque "it matched"."""

    trigger_event_id: UUID
    trigger_id: UUID
    company_id: UUID
    company_name: str
    buying_event_id: UUID
    event_type: str
    category: str | None = None
    title: str | None = None
    summary: str | None = None
    event_score: float | None = None
    published_at: datetime | None = None
    is_new: bool = False
    notified: bool
    detected_at: datetime | None = None


class TriggerEventsOut(BaseModel):
    trigger: TriggerOut
    event_count: int
    # Matches newer than trigger.last_seen_at - what the UI badges as unread.
    new_event_count: int = 0
    company_count: int = 0
    events: list[TriggerEventOut]


class TriggerInsightOut(BaseModel):
    summary: str
