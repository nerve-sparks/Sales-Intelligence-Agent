from app.models import TriggerDefinition, TriggerEvent


def serialize_trigger(trigger: TriggerDefinition) -> dict:
    return {
        "trigger_id": str(trigger.trigger_id),
        "name": trigger.name,
        "signal_types": trigger.signal_types,
        "signal_categories": trigger.signal_categories,
        "created_at": trigger.created_at,
        "updated_at": trigger.updated_at,
    }


def serialize_trigger_event(event: TriggerEvent) -> dict:
    return {
        "trigger_event_id": str(event.trigger_event_id),
        "trigger_id": str(event.trigger_id),
        "company_id": str(event.company_id),
        "company_name": event.company.company_name,
        "signal_id": str(event.signal_id),
        "signal_type": event.signal.signal_type,
        "signal_category": event.signal.signal_category,
        "core_fact": event.signal.core_fact,
        "notified": event.notified,
        "detected_at": event.detected_at,
    }
