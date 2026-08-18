"""LLM client. SINGLE provider by explicit instruction: BridgeLLM (a LiteLLM
proxy at BRIDGE_BASE_URL) routed to BRIDGE_MODEL, auth via LLM_API_KEY. There
is deliberately NO fallback - if this provider fails, the call fails.

Which of the proxy's models actually work
-----------------------------------------
The key lists 29 models; only 8 serve a request, all of them Gemini. Probed
live, one request each ("reply with exactly: ok", max_tokens=400):

    WORKING                     latency  out  thinking
    gemini-flash-lite-latest      1.00s    1     0     <- plain, fastest
    gemini-3.1-flash-lite         0.94s    1     0     <- plain
    gemini-2.5-flash              1.18s   15    14
    gemini-flash-latest           1.90s   74    73     <- ACTIVE (BRIDGE_MODEL)
    gemini-3.7-flash              2.70s   75    74
    gemini-2.5-pro                3.03s  159   158
    gemini-pro                    2.97s  161   160
    gemini-3.6-flash              4.28s  126   125

    BROKEN (22)
    all 14 gpt-* models           401  proxy has no OPENAI_API_KEY configured
    all 3 claude-* models         400  proxy's Anthropic account out of credits
    gemini-flash                  404  alias -> gemini-2.0-flash (retired)
    gemini-3-pro                  404  alias -> gemini-3-pro-preview (retired)
    gemini-3-flash                404  alias misrouted upstream
    gemini-2.5-flash-lite         404  same

Every failure is a provisioning problem ON THE PROXY - no client-side change
fixes any of them, and adding model NAMES does not fix them either: the
catalogue grew 9 -> 29 in one session while the two underlying credential
problems (no OpenAI key, unfunded Anthropic account) stayed exactly as they
were, so all 17 new gpt-*/claude-* entries are dead aliases.

Before switching BRIDGE_MODEL to something that looks better on paper, PROBE
it. /v1/models advertising a name has repeatedly proved to be no guarantee it
serves: an earlier catalogue listed exactly one model
(gemini/gemini-2.5-flash-lite) that 400'd on every call because it was a
wildcard route with no deployment behind it - /model/info returned {"data": []}
at the time, and that emptiness was the tell.

Also note the proxy went fully down mid-session (502 from nginx on every path
including /health/readiness and /v1/models, which need no model routing at
all). If every call suddenly 502s, check the proxy is up before suspecting
anything here.

Because there is no fallback, a BRIDGE_MODEL that stops serving means
buying_event_service / signal_llm degrade to their non-LLM paths and no
BuyingEvents get extracted at all. The DeepSeek and Ollama client factories
below are retained precisely so restoring a fallback is a small, local edit to
complete() rather than a rewrite - nothing calls them today.

Every call is traced in Langfuse (LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL
in .env). Config is imported first so load_dotenv() has already run
before Langfuse is touched (common mistake per the instrumentation
skill). Tracing is done explicitly in complete() rather than via the
`langfuse.openai` drop-in: that wrapper copies usage from
response.usage.__dict__, which is empty on openai>=2 pydantic models, so
Langfuse was recording 0 tokens and $0 cost. We also register a priced
model definition for this proxy's Gemini aliases - see langfuse_cost.py.
"""

import uuid

# Config must be imported (and load_dotenv() must have already run, which it
# does at app.core.config import time) BEFORE any Langfuse client is
# constructed inside complete() / langfuse_cost.
from app.core.config import get_settings  # noqa: E402  (import-order matters, see above)
from openai import AsyncOpenAI  # noqa: E402

from app.services.langfuse_cost import finish_llm_generation, trace_llm_generation

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"
BRIDGE_BASE_URL = "https://llm.bridgellm.nervesparks.com"
# The active model. A `-latest` alias on purpose: four of this proxy's static
# Gemini aliases (gemini-flash, gemini-3-flash, gemini-3-pro,
# gemini-2.5-flash-lite) already 404 because they point at upstream models
# Google has since retired, so a pinned name here is a future outage.
#
# This is a REASONING model - measured 74 output tokens of which 73 were
# reasoning, to answer "reply with exactly: ok" (1.9s). Consequence to
# remember: never send a tight max_tokens. Thinking is budgeted from the same
# completion allowance, so a small cap returns an EMPTY string with
# finish_reason="stop" rather than an error - which _parse() in
# buying_event_service reads as "no events found", not "the call failed", and
# the company gets silently stamped researched-with-no-evidence. complete()
# therefore passes no max_tokens at all, letting the model default apply.
#
# gemini-flash-lite-latest and gemini-3.1-flash-lite are the only working
# NON-reasoning options if that overhead ever needs removing (~1.0s/call, zero
# thinking tokens), at the cost of a smaller model doing the extraction
# judgement.
BRIDGE_MODEL = "gemini-flash-latest"

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
    """Whether the single configured provider (BridgeLLM) is usable - lets
    callers (e.g. signal_llm) fail fast and fall back to non-LLM behaviour
    instead of firing a request that's certain to raise
    LLMNotConfiguredError.

    Checks LLM_API_KEY only. It deliberately does NOT consider
    DEEPSEEK_API_KEY / OLLAMA_BASE_URL: those are still present in .env but
    unreachable from complete(), so counting them would report the LLM as
    available when every call is guaranteed to fail."""
    return bool(get_settings().llm_api_key)


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
    the Langfuse generation recorded around this call.

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

    settings = get_settings()
    if not settings.llm_api_key:
        raise LLMNotConfiguredError("LLM_API_KEY is not set in the environment")

    print(f"[LLM-PROVIDER] Calling BridgeLLM ({BRIDGE_MODEL}) for '{generation_name}'...")
    client = _get_bridge_client()
    with trace_llm_generation(
        name=generation_name,
        model=BRIDGE_MODEL,
        messages=messages,
        session_id=trace_id,
        user_id=trace_user_id,
        tags=[generation_name],
    ) as observation:
        try:
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
        except Exception as exc:
            # No fallback by design (see module docstring). A 400 "Invalid model
            # name" here is the proxy having no deployment registered for
            # BRIDGE_MODEL - a server-side fix, not a code one.
            print(f"[LLM-PROVIDER] !!! BridgeLLM FAILED for '{generation_name}' "
                  f"- {type(exc).__name__}: {exc}")
            finish_llm_generation(observation, output="", usage=None, error=str(exc))
            raise

        text = response.choices[0].message.content or ""
        finish_llm_generation(observation, output=text, usage=getattr(response, "usage", None))
        print(f"[LLM-PROVIDER] SUCCESS via BridgeLLM ({BRIDGE_MODEL})")
        return text
