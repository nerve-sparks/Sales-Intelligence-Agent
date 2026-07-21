"""BridgeLLM client - an OpenAI-compatible proxy, routed to
gemini/gemini-2.5-pro. Auth via LLM_API_KEY (see .env)."""

import uuid

from openai import AsyncOpenAI

from app.core.config import get_settings

BASE_URL = "https://llm.bridgellm.nervesparks.com"
MODEL = "gemini/gemini-2.5-pro"

_client: AsyncOpenAI | None = None


class LLMNotConfiguredError(Exception):
    pass


def is_configured() -> bool:
    """Whether LLM_API_KEY is set - lets callers (e.g. signal_llm) fail fast
    and fall back to non-LLM behaviour instead of firing doomed requests."""
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


async def complete(
    messages: list[dict],
    *,
    generation_name: str,
    generation_id: str | None = None,
    trace_id: str | None = None,
    trace_user_id: str | None = None,
) -> str:
    """Sends a chat completion request and returns the assistant's reply text.

    generation_name/id/trace_id/trace_user_id are BridgeLLM's own
    observability metadata (see extra_body.metadata) - generation_name is
    the only one worth always setting explicitly per call site; the rest
    default to a random id if not given.
    """
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
    )
    return response.choices[0].message.content or ""
