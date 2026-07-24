"""BridgeLLM client - an OpenAI-compatible proxy, routed to
gemini/gemini-2.5-flash. Auth via LLM_API_KEY (see .env).

Falls back to a self-hosted Ollama server (OLLAMA_BASE_URL/OLLAMA_MODEL in
.env) when BridgeLLM fails for any reason (budget exceeded, model-access
denied, network error, etc.) - verified reachable and returning
correctly-shaped JSON, but noticeably slower (~27s for a 12-item batch vs
BridgeLLM's cloud latency), since it's a local model over a network link
rather than a hosted API. Only used when the primary call actually fails;
BridgeLLM is always tried first."""

import uuid

from openai import AsyncOpenAI

from app.core.config import get_settings

BASE_URL = "https://llm.bridgellm.nervesparks.com"
MODEL = "gemini/gemini-2.5-flash"

_client: AsyncOpenAI | None = None
_fallback_client: AsyncOpenAI | None = None


class LLMNotConfiguredError(Exception):
    pass


def is_configured() -> bool:
    """Whether LLM_API_KEY is set - lets callers (e.g. signal_llm) fail fast
    and fall back to non-LLM behaviour instead of firing doomed requests.
    The Ollama fallback needs no key, so this only gates the primary path -
    callers that call complete() with no key configured still raise
    LLMNotConfiguredError up front, same as before."""
    return bool(get_settings().llm_api_key)


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is not None:
        return _client

    settings = get_settings()
    if not settings.llm_api_key:
        raise LLMNotConfiguredError("LLM_API_KEY is not set in the environment")

    _client = AsyncOpenAI(api_key=settings.llm_api_key, base_url=BASE_URL)
    return _client


def _get_fallback_client() -> AsyncOpenAI:
    global _fallback_client
    if _fallback_client is not None:
        return _fallback_client
    # Ollama's OpenAI-compatible endpoint doesn't check the API key - any
    # non-empty string satisfies the SDK's requirement that one be set.
    settings = get_settings()
    _fallback_client = AsyncOpenAI(api_key="ollama", base_url=settings.ollama_base_url)
    return _fallback_client


async def complete(
    messages: list[dict],
    *,
    generation_name: str,
    generation_id: str | None = None,
    trace_id: str | None = None,
    trace_user_id: str | None = None,
    temperature: float | None = None,
) -> str:
    """Sends a chat completion request and returns the assistant's reply text.

    generation_name/id/trace_id/trace_user_id are BridgeLLM's own
    observability metadata (see extra_body.metadata) - generation_name is
    the only one worth always setting explicitly per call site; the rest
    default to a random id if not given.

    temperature, when given, is forwarded to the model - callers that need
    reproducible output (e.g. the lead-scoring judge) pass 0.

    Tries BridgeLLM first; if that raises for any reason, retries once
    against the local Ollama fallback before giving up. Callers (scoring_llm,
    signal_llm) already catch a failed complete() and degrade to rule-based
    logic, so this only improves the odds of getting a real judgment without
    changing what happens if both providers are unavailable.
    """
    kwargs: dict = {}
    if temperature is not None:
        kwargs["temperature"] = temperature

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            extra_body={
                "metadata": {
                    "generation_name": generation_name,
                    "generation_id": generation_id or str(uuid.uuid4()),
                    "trace_id": trace_id or str(uuid.uuid4()),
                    "trace_user_id": trace_user_id or "signal-backend",
                }
            },
            **kwargs,
        )
        return response.choices[0].message.content or ""
    except LLMNotConfiguredError:
        raise
    except Exception:
        fallback = _get_fallback_client()
        response = await fallback.chat.completions.create(
            model=get_settings().ollama_model,
            messages=messages,
            **kwargs,
        )
        return response.choices[0].message.content or ""
