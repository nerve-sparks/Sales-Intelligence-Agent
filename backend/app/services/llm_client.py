"""LLM client with three providers, tried in order until one succeeds:

1. BridgeLLM (primary) - an OpenAI-compatible proxy routed to
   gemini/gemini-2.5-flash-lite (the only model LLM_API_KEY has access to -
   gemini-2.5-flash itself 403s on this key), auth via LLM_API_KEY. Measured
   ~21s/call avg and noticeably less selective at rejecting non-events than
   DeepSeek was (see conversation history: an extraction-quality comparison
   found it accepted ~100% of evidence items vs DeepSeek being selective,
   which drove a real dedup double-counting bug - since fixed in
   buying_event_service._merge_similar_groups/_stem, which now stems verb
   tense/plural variance so a less-consistent model's paraphrasing of the SAME
   real event ("acquired" vs "acquires") still merges instead of being
   counted twice). Made primary per explicit instruction despite the slower/
   less-selective tradeoffs vs DeepSeek.
2. DeepSeek (fallback) - deepseek-chat (currently resolves to
   deepseek-v4-flash server-side), auth via DEEPSEEK_API_KEY. Fast, cheap, and
   genuinely serves concurrent requests - measured at ~3.5s/call, versus
   Ollama's ~68-214s/call on this deployment.
3. Ollama (last-resort fallback) - a self-hosted server, OLLAMA_BASE_URL/
   OLLAMA_MODEL in .env. No per-request cost, but slow and effectively
   single-threaded on this deployment - kept only as a free safety net if
   BOTH paid providers are ever unavailable, not because it's fast.

Each tier is attempted only if it's actually configured, and only after the
previous tier has raised. If every configured tier fails, the FIRST failure
(from the primary/BridgeLLM, if it was attempted) is what propagates, since
that's the most diagnostically useful one - a fallback failing too is
expected noise, not new information. LLMNotConfiguredError is raised up
front only when NONE of the three are configured at all.

Every call is traced in Langfuse (LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL in
.env) via the `langfuse.openai` drop-in client wrapper - this is why
`AsyncOpenAI` is imported from `langfuse.openai` below instead of `openai`
directly (see app.core.config's load_dotenv() ordering note). The wrapper
auto-captures model name, token usage (and DeepSeek's cache-hit/miss token
split), and full input/output on every call with no extra code at the
`.create()` site beyond the `name=`/`metadata=` kwargs added here - callers
just keep passing generation_name/trace_id/trace_user_id as before, and this
module maps them onto Langfuse's session_id/user_id/tags. See
.claude/skills/langfuse/references/instrumentation.md for the instrumentation
best practices this follows.
"""

import uuid

# Config must be imported (and load_dotenv() must have already run, which it
# does at app.core.config import time) BEFORE langfuse.openai, or Langfuse
# initializes with missing/wrong credentials (common mistake per the
# instrumentation skill).
from app.core.config import get_settings  # noqa: E402  (import-order matters, see above)
from langfuse.openai import AsyncOpenAI  # noqa: E402

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
BRIDGE_BASE_URL = "https://llm.bridgellm.nervesparks.com"
# LLM_API_KEY is scoped to flash-lite only - confirmed live: a direct call
# with "gemini/gemini-2.5-flash" 403s ("key not allowed to access model. This
# key can only access models=['gemini/gemini-2.5-flash-lite']"). That meant
# this whole fallback tier was silently dead - any time DeepSeek failed,
# BridgeLLM would 403 too instead of actually catching the failure.
BRIDGE_MODEL = "gemini/gemini-2.5-flash-lite"

# The SDK's own default (read=600s, i.e. 10 minutes, with its own 2 hidden
# retries) turns one stalled call into a slot held for up to ~30 minutes -
# with only research_concurrency slots total, a handful of stalled DeepSeek/
# BridgeLLM calls can stall an entire batch (confirmed live: 7/493 companies
# progressed in 20 minutes, none yet in 'retrying' or 'failed', meaning they
# were still hung on their first attempt). Fast providers get a short timeout
# so a stall fails over quickly instead of silently eating a slot; Ollama
# keeps a long one since it's genuinely slow (68-214s/call measured). Each
# client's max_retries=0 disables the SDK's own hidden retry loop - our own
# outer retry/backoff in search_signal_ingest._process_company is the only
# retry layer, so the two don't compound.
FAST_PROVIDER_TIMEOUT_SECONDS = 45.0
OLLAMA_TIMEOUT_SECONDS = 240.0

_deepseek_client: AsyncOpenAI | None = None
_bridge_client: AsyncOpenAI | None = None
_ollama_client: AsyncOpenAI | None = None


class LLMNotConfiguredError(Exception):
    pass


def is_configured() -> bool:
    """Whether ANY provider is usable - lets callers (e.g. signal_llm) fail
    fast and fall back to non-LLM behaviour instead of firing a request
    that's certain to raise LLMNotConfiguredError."""
    settings = get_settings()
    return bool(settings.deepseek_api_key or settings.llm_api_key or settings.ollama_base_url)


def _get_deepseek_client() -> AsyncOpenAI:
    global _deepseek_client
    if _deepseek_client is not None:
        return _deepseek_client
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise LLMNotConfiguredError("DEEPSEEK_API_KEY is not set in the environment")
    _deepseek_client = AsyncOpenAI(
        api_key=settings.deepseek_api_key,
        base_url=DEEPSEEK_BASE_URL,
        timeout=FAST_PROVIDER_TIMEOUT_SECONDS,
        max_retries=0,
    )
    return _deepseek_client


def _get_bridge_client() -> AsyncOpenAI:
    global _bridge_client
    if _bridge_client is not None:
        return _bridge_client
    settings = get_settings()
    if not settings.llm_api_key:
        raise LLMNotConfiguredError("LLM_API_KEY is not set in the environment")
    _bridge_client = AsyncOpenAI(
        api_key=settings.llm_api_key,
        base_url=BRIDGE_BASE_URL,
        timeout=FAST_PROVIDER_TIMEOUT_SECONDS,
        max_retries=0,
    )
    return _bridge_client


def _get_ollama_client() -> AsyncOpenAI:
    global _ollama_client
    if _ollama_client is not None:
        return _ollama_client
    # Ollama's OpenAI-compatible endpoint doesn't check the API key - any
    # non-empty string satisfies the SDK's requirement that one be set.
    settings = get_settings()
    _ollama_client = AsyncOpenAI(
        api_key="ollama",
        base_url=settings.ollama_base_url,
        timeout=OLLAMA_TIMEOUT_SECONDS,
        max_retries=0,
    )
    return _ollama_client


def _langfuse_metadata(trace_id: str | None, trace_user_id: str | None, generation_name: str) -> dict:
    """Maps this module's existing trace_id/trace_user_id params onto
    Langfuse's session_id/user_id, plus an auto-derived tag from
    generation_name (satisfies the instrumentation skill's "feature tag"
    guidance with zero extra params needed at call sites). Only non-None
    values are included - Langfuse ignores absent keys rather than treating
    them as "no session"/"no user" the same way an explicit None would in
    some SDKs, so we omit rather than pass None."""
    metadata: dict = {"langfuse_tags": [generation_name]}
    if trace_id:
        metadata["langfuse_session_id"] = trace_id
    if trace_user_id:
        metadata["langfuse_user_id"] = trace_user_id
    return metadata


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

    generation_name becomes both this call's Langfuse observation name (also
    forwarded to BridgeLLM's own metadata) - name it as a verb-first action
    ("extract-buying-events", not "buying-event-extraction") per Langfuse's
    naming guidance, since it's a stable identifier evaluators/dashboards key
    on. trace_id/trace_user_id become Langfuse's session_id/user_id when
    given - callers pass their own natural grouping (e.g. a research_run_id
    as the session covering every classification call made in one research
    pass, an organisation_id as the user for per-tenant cost attribution).
    generation_id/trace_id/trace_user_id are ALSO still attached to
    BridgeLLM's own proprietary metadata (extra_body.metadata), separate from
    the Langfuse wrapper.

    temperature, when given, is forwarded to the model - callers that need
    reproducible output (e.g. the lead-scoring judge) pass 0.

    Tries DeepSeek, then BridgeLLM, then Ollama - see module docstring for
    why this order. Callers (buying_event_service, signal_llm) already catch
    a failed complete() and degrade to rule-based logic, so this only
    improves the odds of getting a real judgment without changing what
    happens if every provider is unavailable.
    """
    kwargs: dict = {}
    if temperature is not None:
        kwargs["temperature"] = temperature

    langfuse_metadata = _langfuse_metadata(trace_id, trace_user_id, generation_name)

    settings = get_settings()
    if not settings.deepseek_api_key and not settings.llm_api_key and not settings.ollama_base_url:
        raise LLMNotConfiguredError(
            "No LLM provider is configured (DEEPSEEK_API_KEY / LLM_API_KEY / OLLAMA_BASE_URL)"
        )

    first_error: Exception | None = None

    if settings.llm_api_key:
        try:
            print(f"[LLM-PROVIDER] Trying PRIMARY: BridgeLLM ({BRIDGE_MODEL}) for '{generation_name}'...")
            client = _get_bridge_client()
            response = await client.chat.completions.create(
                model=BRIDGE_MODEL,
                messages=messages,
                name=generation_name,
                metadata=langfuse_metadata,
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
            print(f"[LLM-PROVIDER] SUCCESS via BridgeLLM ({BRIDGE_MODEL})")
            return response.choices[0].message.content or ""
        except Exception as exc:
            print(f"[LLM-PROVIDER] BridgeLLM FAILED: {type(exc).__name__}: {exc} -> falling back to DeepSeek")
            first_error = exc

    if settings.deepseek_api_key:
        try:
            print(f"[LLM-PROVIDER] Trying FALLBACK: DeepSeek ({DEEPSEEK_MODEL}) for '{generation_name}'...")
            client = _get_deepseek_client()
            response = await client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=messages,
                name=generation_name,
                metadata=langfuse_metadata,
                **kwargs,
            )
            print(f"[LLM-PROVIDER] SUCCESS via DeepSeek ({DEEPSEEK_MODEL})")
            return response.choices[0].message.content or ""
        except Exception as exc:
            print(f"[LLM-PROVIDER] DeepSeek FAILED: {type(exc).__name__}: {exc} -> falling back to Ollama")
            if first_error is None:
                first_error = exc

    if settings.ollama_base_url:
        try:
            print(f"[LLM-PROVIDER] Trying LAST-RESORT: Ollama ({settings.ollama_model}) for '{generation_name}'...")
            client = _get_ollama_client()
            response = await client.chat.completions.create(
                model=settings.ollama_model,
                messages=messages,
                name=generation_name,
                metadata=langfuse_metadata,
                **kwargs,
            )
            print(f"[LLM-PROVIDER] SUCCESS via Ollama ({settings.ollama_model})")
            return response.choices[0].message.content or ""
        except Exception as exc:
            print(f"[LLM-PROVIDER] Ollama FAILED: {type(exc).__name__}: {exc} -> ALL PROVIDERS EXHAUSTED")
            if first_error is None:
                first_error = exc

    # Every configured provider failed - surface the primary's own failure,
    # the most diagnostically relevant one (see module docstring).
    print(f"[LLM-PROVIDER] !!! ALL PROVIDERS FAILED for '{generation_name}' - raising {type(first_error).__name__}")
    raise first_error
