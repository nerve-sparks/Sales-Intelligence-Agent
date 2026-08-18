"""Langfuse cost tracking for BridgeLLM Gemini calls.

Langfuse only infers USD cost when a generation's `model` matches a model
definition that has prices. This project's proxy reports aliases
(`gemini-flash-latest`, sometimes `gemini-1.5-flash-latest`) that the
self-hosted Langfuse catalogue either does not include, or includes with
null prices (see the managed `gemini-1.5-flash` row). Tokens can still
land; cost stays $0.

Two complementary fixes live here:

1. `ensure_langfuse_model_prices()` registers a user-defined model whose
   match_pattern covers those aliases. User-defined models take priority
   over Langfuse-managed ones, so this also overrides the unpriced
   `gemini-1.5-flash` entry. Inferred cost applies to *new* generations.
2. `trace_llm_generation()` records usage + cost on the generation itself
   (ingested cost beats inference). Prices follow Gemini 2.5 Flash public
   rates because `gemini-flash-latest` is a reasoning Flash model, not the
   retired Gemini 1.5 Flash SKU the proxy name sometimes implies.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator

import httpx

log = logging.getLogger(__name__)

# USD per token. Gemini 2.5 Flash paid tier: $0.30 / 1M input, $2.50 / 1M
# output (thinking tokens billed as output).
INPUT_USD_PER_TOKEN = 0.30 / 1_000_000
OUTPUT_USD_PER_TOKEN = 2.50 / 1_000_000

# Covers the name we send (`gemini-flash-latest`) and the stale upstream
# name the proxy has been known to echo (`gemini-1.5-flash-latest`), plus
# LiteLLM `gemini/` and Vertex `google/` prefixes.
MODEL_MATCH_PATTERN = (
    r"(?i)^((google(ai)?|gemini)/)?"
    r"(gemini-flash-latest|gemini-1\.5-flash(-latest)?)$"
)
MODEL_DEFINITION_NAME = "gemini-flash-latest"
_prices_registered = False


def usage_tokens(usage: Any) -> tuple[int, int]:
    """Pull prompt/completion counts out of an OpenAI-style usage object.

    openai>=2 pydantic models do not expose fields via `__dict__` the way
    Langfuse's older OpenAI wrapper expects, which is how generations can
    land with usage input/output/total all 0 even when the proxy returned
    real token counts.
    """
    if usage is None:
        return 0, 0
    if hasattr(usage, "model_dump"):
        data = usage.model_dump()
    elif hasattr(usage, "dict"):
        data = usage.dict()
    elif isinstance(usage, dict):
        data = usage
    else:
        data = {
            "prompt_tokens": getattr(usage, "prompt_tokens", 0),
            "completion_tokens": getattr(usage, "completion_tokens", 0),
        }
    prompt = int(data.get("prompt_tokens") or data.get("input") or 0)
    completion = int(data.get("completion_tokens") or data.get("output") or 0)
    return prompt, completion


def cost_usd(prompt_tokens: int, completion_tokens: int) -> tuple[float, float, float]:
    input_cost = prompt_tokens * INPUT_USD_PER_TOKEN
    output_cost = completion_tokens * OUTPUT_USD_PER_TOKEN
    return input_cost, output_cost, input_cost + output_cost


def _langfuse_base_url() -> str | None:
    return (os.environ.get("LANGFUSE_BASE_URL") or os.environ.get("LANGFUSE_HOST") or "").rstrip("/") or None


def _langfuse_auth() -> tuple[str, str] | None:
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
    if not public_key or not secret_key:
        return None
    return public_key, secret_key


def ensure_langfuse_model_prices() -> None:
    """Create the custom priced model if this project does not already have one.

    Safe to call on every startup: skips when credentials are missing, when
    a non-managed model with this name already exists, or when Langfuse is
    unreachable. Never raises into the API process.
    """
    global _prices_registered
    if _prices_registered:
        return
    base = _langfuse_base_url()
    auth = _langfuse_auth()
    if not base or not auth:
        return
    payload = {
        "modelName": MODEL_DEFINITION_NAME,
        "matchPattern": MODEL_MATCH_PATTERN,
        "unit": "TOKENS",
        "inputPrice": INPUT_USD_PER_TOKEN,
        "outputPrice": OUTPUT_USD_PER_TOKEN,
    }
    try:
        # POST-only: listing every model on this host can time out, and a
        # duplicate name is returned as 409 which we treat as already done.
        with httpx.Client(timeout=45.0) as client:
            created = client.post(f"{base}/api/public/models", auth=auth, json=payload)
            if created.status_code in {409, 422}:
                _prices_registered = True
                log.info("Langfuse model prices already present for %s", MODEL_DEFINITION_NAME)
                return
            created.raise_for_status()
            _prices_registered = True
            log.info("Registered Langfuse model prices for %s", MODEL_DEFINITION_NAME)
    except Exception:
        log.warning("Could not register Langfuse model prices", exc_info=True)


def _finish_observation(
    observation: Any,
    *,
    output: str,
    prompt_tokens: int,
    completion_tokens: int,
    error: str | None = None,
) -> None:
    input_cost, output_cost, total_cost = cost_usd(prompt_tokens, completion_tokens)
    payload: dict[str, Any] = {
        "output": output,
        "usage_details": {
            "input": prompt_tokens,
            "output": completion_tokens,
            "total": prompt_tokens + completion_tokens,
        },
        "cost_details": {
            "input": input_cost,
            "output": output_cost,
            "total": total_cost,
        },
    }
    if error:
        payload["level"] = "ERROR"
        payload["status_message"] = error
    if observation is None or not hasattr(observation, "update"):
        return
    try:
        observation.update(**payload)
        return
    except TypeError:
        pass
    # Langfuse Python v2 generation.update() uses `usage` + input_cost, not
    # usage_details/cost_details.
    try:
        observation.update(
            output=output,
            usage={
                "input": prompt_tokens,
                "output": completion_tokens,
                "total": prompt_tokens + completion_tokens,
                "unit": "TOKENS",
                "input_cost": input_cost,
                "output_cost": output_cost,
                "total_cost": total_cost,
            },
            **({"level": "ERROR", "status_message": error} if error else {}),
        )
    except Exception:
        log.warning("Could not attach Langfuse usage/cost to the generation", exc_info=True)


@contextmanager
def trace_llm_generation(
    *,
    name: str,
    model: str,
    messages: list[dict],
    session_id: str | None,
    user_id: str | None,
    tags: list[str],
) -> Iterator[Any]:
    """Yield a Langfuse generation observation, or None if tracing is off.

    Call `finish_llm_generation` (or rely on the caller updating the
    yielded observation) before leaving the `with` block so cost is on
    the generation before it closes.
    """
    if not _langfuse_auth():
        yield None
        return

    try:
        from langfuse import get_client

        lf = get_client()
        start = getattr(lf, "start_as_current_observation", None)
        if start is None:
            raise AttributeError("start_as_current_observation")
        with start(as_type="generation", name=name, model=model, input=messages) as observation:
            try:
                from langfuse import propagate_attributes

                attrs: dict[str, Any] = {}
                if session_id:
                    attrs["session_id"] = session_id
                if user_id:
                    attrs["user_id"] = user_id
                if tags:
                    attrs["tags"] = tags
                if attrs:
                    with propagate_attributes(**attrs):
                        yield observation
                else:
                    yield observation
            except ImportError:
                yield observation
        return
    except Exception:
        log.debug("Langfuse v4 generation API unavailable; trying v2", exc_info=True)

    try:
        from langfuse import Langfuse

        public_key, secret_key = _langfuse_auth()
        lf = Langfuse(public_key=public_key, secret_key=secret_key, host=_langfuse_base_url())
        trace_kwargs: dict[str, Any] = {"name": name}
        if session_id:
            trace_kwargs["session_id"] = session_id
        if user_id:
            trace_kwargs["user_id"] = user_id
        if tags:
            trace_kwargs["tags"] = tags
        trace = lf.trace(**trace_kwargs)
        observation = trace.generation(name=name, model=model, input=messages)
        try:
            yield observation
        finally:
            try:
                observation.end()
            except Exception:
                pass
        return
    except Exception:
        log.warning("Langfuse tracing unavailable for this LLM call", exc_info=True)
        yield None


def finish_llm_generation(
    observation: Any,
    *,
    output: str,
    usage: Any,
    error: str | None = None,
) -> None:
    prompt_tokens, completion_tokens = usage_tokens(usage)
    _finish_observation(
        observation,
        output=output,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        error=error,
    )
