"""LLM client with two providers: a self-hosted Ollama server (primary -
OLLAMA_BASE_URL/OLLAMA_MODEL in .env, no per-request cost) and BridgeLLM, an
OpenAI-compatible proxy routed to gemini/gemini-2.5-flash (fallback - auth via
LLM_API_KEY in .env).

Ollama is tried first on every call; BridgeLLM is only used when Ollama fails
(unreachable, timeout, bad response) and a bridge key is actually configured.
Ollama is noticeably slower (~27s for a 12-item batch vs BridgeLLM's cloud
latency) since it's a local model over a network link rather than a hosted
API, but requires no external key/budget - the tradeoff favours it as the
default path, with BridgeLLM as a paid safety net rather than the other way
around."""

import uuid

from openai import AsyncOpenAI

from app.core.config import get_settings

BRIDGE_BASE_URL = "https://llm.bridgellm.nervesparks.com"
BRIDGE_MODEL = "gemini/gemini-2.5-flash"

_ollama_client: AsyncOpenAI | None = None
_bridge_client: AsyncOpenAI | None = None


class LLMNotConfiguredError(Exception):
    pass


def is_configured() -> bool:
    """Whether SOME LLM provider is usable - Ollama (OLLAMA_BASE_URL always
    has a working default, so this is normally True) or BridgeLLM
    (LLM_API_KEY). Lets callers (e.g. signal_llm) fail fast and fall back to
    non-LLM behaviour instead of firing a request that's certain to raise
    LLMNotConfiguredError."""
    settings = get_settings()
    return bool(settings.ollama_base_url or settings.llm_api_key)


def _get_ollama_client() -> AsyncOpenAI:
    global _ollama_client
    if _ollama_client is not None:
        return _ollama_client
    # Ollama's OpenAI-compatible endpoint doesn't check the API key - any
    # non-empty string satisfies the SDK's requirement that one be set.
    settings = get_settings()
    _ollama_client = AsyncOpenAI(api_key="ollama", base_url=settings.ollama_base_url)
    return _ollama_client


def _get_bridge_client() -> AsyncOpenAI:
    global _bridge_client
    if _bridge_client is not None:
        return _bridge_client

    settings = get_settings()
    if not settings.llm_api_key:
        raise LLMNotConfiguredError("LLM_API_KEY is not set in the environment")

    _bridge_client = AsyncOpenAI(api_key=settings.llm_api_key, base_url=BRIDGE_BASE_URL)
    return _bridge_client


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
    observability metadata (see extra_body.metadata), only attached to the
    BridgeLLM call - generation_name is the only one worth always setting
    explicitly per call site; the rest default to a random id if not given.

    temperature, when given, is forwarded to the model - callers that need
    reproducible output (e.g. the lead-scoring judge) pass 0.

    Tries Ollama first (primary); if that raises for any reason and
    LLM_API_KEY is configured, retries once against BridgeLLM (fallback)
    before giving up - raising Ollama's own error, not BridgeLLM's, since
    that's the more useful one for debugging the primary path. Raises
    LLMNotConfiguredError up front only when NEITHER provider is set up at
    all. Callers (buying_event_service, signal_llm) already catch a failed
    complete() and degrade to rule-based logic, so this only improves the
    odds of getting a real judgment without changing what happens if both
    providers are unavailable.
    """
    kwargs: dict = {}
    if temperature is not None:
        kwargs["temperature"] = temperature

    settings = get_settings()
    if not settings.ollama_base_url and not settings.llm_api_key:
        raise LLMNotConfiguredError("Neither OLLAMA_BASE_URL nor LLM_API_KEY is configured")

    ollama_error: Exception | None = None
    if settings.ollama_base_url:
        try:
            client = _get_ollama_client()
            response = await client.chat.completions.create(
                model=settings.ollama_model,
                messages=messages,
                **kwargs,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            ollama_error = exc

    if settings.llm_api_key:
        client = _get_bridge_client()
        response = await client.chat.completions.create(
            model=BRIDGE_MODEL,
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

    # No bridge key to fall back to - surface Ollama's own failure, which is
    # the actually-relevant error here (BridgeLLM was never attempted).
    raise ollama_error