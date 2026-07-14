from app.models import Signal


def serialize_signal(sig: Signal) -> dict:
    return {
        "signal_id": str(sig.signal_id),
        "company_id": str(sig.company_id),
        "source": sig.source,
        "original_source": sig.original_source,
        "signal_type": sig.signal_type,
        "signal_category": sig.signal_category,
        "core_fact": sig.core_fact,
        "dollar_value_usd": float(sig.dollar_value_usd) if sig.dollar_value_usd is not None else None,
        "extraction_method": sig.extraction_method,
        "extraction_confidence": float(sig.extraction_confidence) if sig.extraction_confidence is not None else None,
        "is_action": sig.is_action,
        "m2_corroboration": float(sig.m2_corroboration) if sig.m2_corroboration is not None else None,
        "m3_recency": float(sig.m3_recency) if sig.m3_recency is not None else None,
        "m4_resourcing": float(sig.m4_resourcing) if sig.m4_resourcing is not None else None,
        "signal_confidence": float(sig.signal_confidence) if sig.signal_confidence is not None else None,
        "ingested_at": sig.ingested_at,
        "scored_at": sig.scored_at,
    }
