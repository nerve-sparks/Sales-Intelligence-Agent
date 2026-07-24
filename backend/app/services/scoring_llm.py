"""LLM judgement for the two count-based lead-scoring dimensions (BridgeLLM /
gemini-2.5-pro, temperature 0 for reproducibility).

Why this exists: the ZoomInfo export gives each company EXACTLY ONE intent
topic, one scoop, one news item. The old count-based D1/D2 were therefore
mathematically stuck - D2's buckets (<=2 -> 33, <=5 -> 66) could only ever
return 0 or 33 for a company with one intent, so they differentiated nobody.
This module replaces those two counts with a relevance/strength judgement:

  D1 (pain / buying signal): read the scoop + news TEXT and score how strong
      a buying signal it is, 0-100.
  D2 (intent relevance):     map the open-ended intent topic to an AI/software
      buying-readiness weight, 0.0-1.0 (the scorer multiplies this by the
      real ZoomInfo intent_score, so the LLM never owns the final number).

Everything else in lead_scorer.py (gates, D3-D7, the weights, the formula,
the lead_score table) is unchanged - the LLM only supplies these two
judgement reads, and only for companies that actually have signal text.

Guardrails (see _parse): d1 clamped to [0,100], d2 to [0,1]; anything
unparseable is simply omitted from the result, so the caller falls back to
the original count-based math. A chunk that errors/times out drops only its
own companies, never the batch. is_configured() lets the caller skip the LLM
entirely (offline / no key) and score exactly as before.
"""

import asyncio
import json
from dataclasses import dataclass
from uuid import UUID

from app.services import llm_client

CHUNK_SIZE = 12
MAX_CONCURRENCY = 8


@dataclass
class JudgeInput:
    company_id: UUID
    intent_topic: str | None
    scoop_topic: str | None
    scoop_description: str | None
    news_title: str | None
    news_description: str | None

    def has_text(self) -> bool:
        return any(
            v
            for v in (
                self.intent_topic,
                self.scoop_topic,
                self.scoop_description,
                self.news_title,
                self.news_description,
            )
        )


@dataclass
class ScoringJudgement:
    d1_buying_signal: float  # 0-100
    d2_intent_relevance: float  # 0-1
    d5_urgency_weight: float  # 0-1 (scorer multiplies by math recency_factor)
    d1_reasoning: str | None
    d2_reasoning: str | None
    d5_reasoning: str | None


def _build_prompt(chunk: list[JudgeInput]) -> str:
    items = []
    for i, it in enumerate(chunk):
        items.append(
            f"[{i}] Intent topic: {it.intent_topic or 'none'}. "
            f"Scoop: {it.scoop_topic or 'none'} - {it.scoop_description or 'none'}. "
            f"News: {it.news_title or 'none'} - {it.news_description or 'none'}"
        )
    body = "\n".join(items)
    return (
        "You are a B2B sales signal analyst. For each company, score its signals "
        "for AI/software buying readiness. Judge the scoop/news DESCRIPTION, not "
        "just the topic label. Return ONLY a valid JSON array, no markdown.\n\n"
        "For each item return:\n"
        "- d1_buying_signal (0-100): how strong a BUYING signal the scoop+news is.\n"
        "    Contract Win / Partnership (esp. AI vendor) -> 80-95\n"
        "    Funding & Investment / Acquisition           -> 65-75\n"
        "    Leadership Change / Product Launch            -> 55-70\n"
        "    Hiring / Facilities Expansion                 -> 45-55\n"
        "    Award / Events (noise)                        -> 10-20\n"
        "    Boost if the text mentions AI/ML/RFP/automation.\n"
        "- d1_reasoning: one short sentence.\n"
        "- d2_intent_relevance (0.0-1.0): how much the intent topic signals "
        "AI/software buying readiness.\n"
        "    'AI & Machine Learning', 'Generative AI'            -> 0.9-1.0\n"
        "    'Fraud Detection', 'SIEM', 'Predictive Analytics'   -> 0.8-0.9\n"
        "    'Data Analytics', 'Cloud ERP', 'Cybersecurity'      -> 0.6-0.75\n"
        "    'Digital Transformation', 'SaaS', 'Cloud Computing' -> 0.4-0.55\n"
        "    Events-type / irrelevant                            -> 0.1-0.25\n"
        "- d2_reasoning: one short sentence.\n"
        "- d5_urgency_weight (0.0-1.0): how time-sensitive the scoop is - an "
        "active RFP / vendor evaluation / imminent deadline is urgent (0.8-1.0); "
        "a completed deal, award, or generic news is not (0.1-0.3).\n"
        "- d5_reasoning: one short sentence.\n\n"
        f"Items:\n{body}\n\n"
        "Respond with ONLY a JSON array, one object per item, no prose:\n"
        '[{"index":0,"d1_buying_signal":82,"d1_reasoning":"...",'
        '"d2_intent_relevance":0.9,"d2_reasoning":"...",'
        '"d5_urgency_weight":0.7,"d5_reasoning":"..."}]'
    )


def _clamp(value, lo: float, hi: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(lo, min(hi, float(value)))


def _parse(raw: str, chunk: list[JudgeInput]) -> dict[UUID, ScoringJudgement]:
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return {}
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, list):
        return {}

    out: dict[UUID, ScoringJudgement] = {}
    for obj in parsed:
        if not isinstance(obj, dict):
            continue
        idx = obj.get("index")
        if not isinstance(idx, int) or idx < 0 or idx >= len(chunk):
            continue

        d1 = _clamp(obj.get("d1_buying_signal"), 0.0, 100.0)
        d2 = _clamp(obj.get("d2_intent_relevance"), 0.0, 1.0)
        d5 = _clamp(obj.get("d5_urgency_weight"), 0.0, 1.0)
        if d1 is None or d2 is None or d5 is None:
            # A judgement missing/invalid on any of the three weights is
            # unusable - omit it so the scorer falls back to the rule-based
            # math for that company's D1/D2/D5.
            continue

        def _reason(key: str) -> str | None:
            v = obj.get(key)
            return v.strip() if isinstance(v, str) and v.strip() else None

        out[chunk[idx].company_id] = ScoringJudgement(
            d1_buying_signal=d1,
            d2_intent_relevance=d2,
            d5_urgency_weight=d5,
            d1_reasoning=_reason("d1_reasoning"),
            d2_reasoning=_reason("d2_reasoning"),
            d5_reasoning=_reason("d5_reasoning"),
        )
    return out


async def judge_companies(inputs: list[JudgeInput]) -> dict[UUID, ScoringJudgement]:
    """Judges companies in concurrent chunks at temperature 0. Returns
    {company_id: ScoringJudgement} only for companies the model scored; any
    company absent from the result (no signal text, LLM off, parse failure,
    or a chunk error) is left to the caller's rule-based fallback.

    Never raises for LLM reasons - if the key isn't set, returns {} so
    scoring proceeds exactly as it did before this module existed.
    """
    scorable = [it for it in inputs if it.has_text()]
    if not scorable or not llm_client.is_configured():
        return {}

    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    chunks = [scorable[i : i + CHUNK_SIZE] for i in range(0, len(scorable), CHUNK_SIZE)]

    async def run(chunk: list[JudgeInput]) -> dict[UUID, ScoringJudgement]:
        async with semaphore:
            prompt = _build_prompt(chunk)
            for attempt in range(2):  # one retry
                try:
                    raw = await llm_client.complete(
                        [{"role": "user", "content": prompt}],
                        generation_name="lead-scoring-judge",
                        temperature=0,
                    )
                except Exception:
                    # Transient proxy/timeout error - retry once, then give up
                    # on this chunk (its companies fall back to count math).
                    continue
                result = _parse(raw, chunk)
                if result or attempt == 1:
                    return result
            return {}

    merged: dict[UUID, ScoringJudgement] = {}
    for result in await asyncio.gather(*[run(chunk) for chunk in chunks]):
        merged.update(result)
    return merged
