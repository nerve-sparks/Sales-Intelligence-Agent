"""LLM-based signal classification (BridgeLLM / gemini-2.5-pro).

Used by signal_extractor for the news/scoop text that keyword rules can't
confidently place - the vague phrasing a fixed keyword list misses. Every
field the LLM owns is a *judgment read from the text* (signal_type, is_action,
dollar_value, core_fact, confidence); the scoring math that consumes them
(m2 corroboration from the DB, m3 recency from timestamps, the confidence
formula) stays deterministic in signal_extractor, since the LLM can't see
those and shouldn't invent them.

Guardrails (see _parse): signal_type must be one of the real vocabulary keys
or "none" (dropped); dollar_value is accepted only if that exact figure
actually appears in the source text; everything is clamped/type-checked.
Raises LLMNotConfiguredError when no key is set so the caller can fall back
to keyword-only extraction.
"""

import asyncio
import json
import re
from dataclasses import dataclass

from app.services import llm_client

# Only the event/intent signal types that can genuinely be read from news or
# scoop text. company_identity (employee_count_update, ...) and reachability
# (cto_identified, ...) are deliberately excluded: those are facts derived
# from ZoomInfo's structured fields, not judgments about article text, and
# offering them here would only hurt classification precision.
LLM_SIGNAL_TYPES: dict[str, str] = {
    # ai_seriousness
    "ai_engineer_job_posting": "hiring AI/ML/data engineers or building an AI team",
    "ai_budget_announcement": "allocating budget or funding specifically to AI",
    "ai_tool_adoption": "deploying, launching, or integrating an AI product/platform",
    "ai_partnership_signed": "partnering with an AI vendor or signing an AI agreement",
    "ai_pilot_announced": "starting an AI pilot, proof-of-concept, or trial",
    "ai_transformation_program": "a broad digital/AI transformation or modernization program",
    # ai_pain_points
    "operational_inefficiency": "manual, slow, or broken internal processes",
    "quality_control_issue": "defects, errors, or quality/accuracy problems",
    "supply_chain_disruption": "supply, logistics, or fulfillment problems",
    "labour_shortage": "staffing shortages, hiring struggles, or workforce gaps",
    "cost_pressure_mentioned": "rising costs, margin pressure, or cost-cutting",
    "compliance_burden": "a heavy regulatory, audit, or compliance workload",
    # buying_stage
    "rfp_published": "issued an RFP or request for proposal",
    "procurement_signal": "an active procurement or purchasing process underway",
    "vendor_evaluation_mentioned": "evaluating or comparing vendors/solutions",
    "pilot_in_progress": "running a pilot or trial of a solution",
    "contract_awarded": "awarded or signed a vendor contract",
    "technology_assessment": "assessing technology needs; generic or unclear tech interest",
    # budget_and_capital
    "pe_investment_received": "received private-equity investment or PE backing",
    "funding_round_announced": "raised a venture or growth funding round",
    "government_contract_awarded": "won a government or defense contract",
    "tech_budget_announced": "announced IT/technology spending or budget",
    "acquisition_completed": "completed acquiring another company",
    "ipo_filed": "filed for or completed an IPO",
    # urgency_and_catalysts
    "ceo_change": "a new or departing CEO",
    "cto_change": "a new or departing CTO",
    "cfo_change": "a new or departing CFO",
    "leadership_mandate_announced": "a new senior leader (e.g. AI/digital officer) or top-down mandate",
    "competitor_ai_adoption": "a competitor adopting AI (competitive pressure)",
    "regulatory_change": "a new regulation or policy change affecting them",
    "plant_expansion": "expanding facilities, a new plant, or a new location",
    "merger_announced": "an announced merger",
    # competitive_context
    "existing_vendor_mentioned": "mentions an incumbent vendor/solution already in use",
    "vendor_replacement_signal": "replacing or dissatisfied with a current vendor",
    "greenfield_opportunity": "no existing solution; building from scratch",
    "competitive_evaluation": "comparing competing solutions head-to-head",
}

CHUNK_SIZE = 12
MAX_CONCURRENCY = 8
DEFAULT_CONFIDENCE = 0.75

# Mirrors signal_extractor.DOLLAR_RE - duplicated here (rather than imported)
# to avoid a circular import, since signal_extractor imports this module.
_DOLLAR_RE = re.compile(r"\$[\d,]+\.?\d*\s*[MBK]?", re.IGNORECASE)


@dataclass
class LlmItem:
    index: int
    company: str | None
    industry: str | None
    text: str


@dataclass
class LlmSignalClass:
    signal_type: str | None  # None means "no real signal" - caller drops it
    is_action: bool
    dollar_value_usd: float | None
    core_fact: str | None
    confidence: float


def _dollar_values_in_text(text: str) -> set[float]:
    """Every explicit $ figure in the text, normalized to USD - the set the
    LLM's returned dollar_value must belong to before we trust it."""
    values: set[float] = set()
    for match in _DOLLAR_RE.finditer(text or ""):
        raw = match.group().upper().replace("$", "").replace(",", "").strip()
        multiplier = 1
        if raw.endswith("M"):
            multiplier, raw = 1_000_000, raw[:-1]
        elif raw.endswith("B"):
            multiplier, raw = 1_000_000_000, raw[:-1]
        elif raw.endswith("K"):
            multiplier, raw = 1_000, raw[:-1]
        raw = raw.strip()
        if raw:
            try:
                values.add(float(raw) * multiplier)
            except ValueError:
                pass
    return values


def _build_prompt(chunk: list[LlmItem]) -> str:
    vocab = "\n".join(f'  "{t}": {d}' for t, d in LLM_SIGNAL_TYPES.items())
    items = "\n".join(
        f"[{it.index}] Company: {it.company or 'unknown'}"
        f"{f' ({it.industry})' if it.industry else ''}. Text: {it.text}"
        for it in chunk
    )
    return (
        "You are a B2B sales-signal classifier. For each item, read the news/scoop "
        'text and decide which ONE signal type best fits how a sales team would act '
        'on it - or "none" if the text carries no real buying/intent signal.\n\n'
        "Allowed signal types (use these EXACT keys, nothing else):\n"
        f"{vocab}\n\n"
        "For each item also decide:\n"
        "- is_action: true if the event has already happened or is underway "
        "(raised, signed, launched, hired, awarded); false if only planned, "
        "considered, or explored.\n"
        "- dollar_value_usd: the deal/funding amount in USD ONLY if an explicit "
        "figure appears in the text and it is the relevant amount; otherwise null. "
        "Never invent or infer a number that is not written in the text.\n"
        "- core_fact: a short (max ~12 word) plain-English summary drawn ONLY from "
        "the text - no outside knowledge.\n"
        "- confidence: your confidence from 0.0 to 1.0 in the chosen signal_type.\n\n"
        f"Items:\n{items}\n\n"
        "Respond with ONLY a JSON array, one object per item, no prose or markdown:\n"
        '[{"index":0,"signal_type":"funding_round_announced","is_action":true,'
        '"dollar_value_usd":20000000,"core_fact":"Raised $20M Series B","confidence":0.9}]\n'
        'Use "none" for signal_type when nothing fits.'
    )


def _parse(raw: str, chunk: list[LlmItem]) -> dict[int, LlmSignalClass]:
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return {}
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, list):
        return {}

    by_index = {it.index: it for it in chunk}
    out: dict[int, LlmSignalClass] = {}
    for obj in parsed:
        if not isinstance(obj, dict):
            continue
        idx = obj.get("index")
        if idx not in by_index:
            continue

        signal_type = obj.get("signal_type")
        if signal_type == "none" or signal_type not in LLM_SIGNAL_TYPES:
            out[idx] = LlmSignalClass(None, False, None, None, 0.0)
            continue

        # Dollar grounding: only trust a figure the LLM returns if it actually
        # appears in the source text - never a number it inferred/invented.
        dollar: float | None = None
        raw_dollar = obj.get("dollar_value_usd")
        if isinstance(raw_dollar, (int, float)) and not isinstance(raw_dollar, bool) and raw_dollar > 0:
            candidates = _dollar_values_in_text(by_index[idx].text)
            if any(abs(candidate - float(raw_dollar)) < 1.0 for candidate in candidates):
                dollar = float(raw_dollar)

        core = obj.get("core_fact")
        core = core.strip() if isinstance(core, str) and core.strip() else None

        raw_conf = obj.get("confidence")
        confidence = float(raw_conf) if isinstance(raw_conf, (int, float)) and not isinstance(raw_conf, bool) else DEFAULT_CONFIDENCE
        confidence = max(0.0, min(1.0, confidence))

        out[idx] = LlmSignalClass(signal_type, bool(obj.get("is_action", False)), dollar, core, confidence)
    return out


async def classify_batch(items: list[LlmItem]) -> dict[int, LlmSignalClass]:
    """Classifies items in concurrent chunks. Returns {index: LlmSignalClass}
    for items the model placed; indices absent from the result (or classed as
    "none") carry no signal and should be dropped by the caller. Raises
    LLMNotConfiguredError up front if no key is set."""
    if not items:
        return {}
    if not llm_client.is_configured():
        raise llm_client.LLMNotConfiguredError("LLM_API_KEY is not set")

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    chunks = [items[i : i + CHUNK_SIZE] for i in range(0, len(items), CHUNK_SIZE)]

    async def run(chunk: list[LlmItem]) -> dict[int, LlmSignalClass]:
        async with semaphore:
            try:
                raw = await llm_client.complete(
                    [{"role": "user", "content": _build_prompt(chunk)}],
                    generation_name="signal-extraction-classify",
                )
            except Exception:
                # One chunk failing (timeout, transient proxy error) drops
                # only that chunk's rows, not the whole extraction.
                return {}
            return _parse(raw, chunk)

    merged: dict[int, LlmSignalClass] = {}
    for result in await asyncio.gather(*[run(chunk) for chunk in chunks]):
        merged.update(result)
    return merged
