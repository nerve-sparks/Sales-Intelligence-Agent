import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_env: str
    log_level: str
    database_url: str
    llm_api_key: str | None
    llm_model: str
    deepseek_api_key: str | None
    ollama_base_url: str
    ollama_model: str
    # NervesParks auth-gateway (RS256 JWT verification via JWKS).
    auth_gateway_base_url: str
    auth_gateway_prefix: str
    auth_jwks_url: str | None
    auth_issuer: str | None
    auth_audience: str | None
    auth_verify_claims: bool
    auth_jwks_cache_ttl_seconds: int
    auth_tenant_id: str | None
    scraper_service_url: str | None
    scraper_api_key: str | None
    tavily_api_key: str | None
    # you.com Search (api.you.com/v1/search) - the active web-research
    # provider, replacing Tavily. Chosen for two things Tavily's API does not
    # give: a separate `news` result bucket, and real `page_age` publish dates
    # (measured on the same query: you.com 16/20 results dated, Tavily 0/20 -
    # and an undated result is what made the scorer stamp events "today" and
    # award full freshness to static marketing pages).
    you_api_key: str | None
    # Concurrent companies researched at once (search_signal_ingest.py) - the
    # real throughput lever for "how long does a 500-company upload take".
    # Tunable via env without a redeploy since the right number depends on
    # your Tavily plan's rate limit and (now that DeepSeek is primary in
    # llm_client.py) how many concurrent requests your LLM provider can
    # actually serve without just queueing internally.
    research_concurrency: int
    # SQLAlchemy async engine pool sizing (app/core/db.py) - must scale with
    # research_concurrency, or raising that just trades "waiting on Tavily"
    # for "waiting on a free DB connection" with no net throughput gain.
    db_pool_size: int
    db_max_overflow: int

    @property
    def database_url_sync(self) -> str:
        return self.database_url.replace("+asyncpg", "+psycopg")


def get_settings() -> Settings:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    research_concurrency = int(os.environ.get("RESEARCH_CONCURRENCY", "10"))

    # Prefer AUTH_* names from the org integration guide; fall back to
    # MAIN_AUTH_* (already used in some NervesParks services / this .env).
    auth_jwks_url = os.environ.get("AUTH_JWKS_URL") or os.environ.get("MAIN_AUTH_JWKS_URL")
    auth_issuer = os.environ.get("AUTH_ISSUER") or os.environ.get("MAIN_AUTH_ISSUER")
    auth_audience = os.environ.get("AUTH_AUDIENCE") or os.environ.get("MAIN_AUTH_AUDIENCE")
    auth_ttl = os.environ.get("AUTH_JWKS_CACHE_TTL_SECONDS") or os.environ.get(
        "MAIN_AUTH_JWKS_CACHE_TTL_SECONDS", "86400"
    )

    return Settings(
        app_env=os.environ.get("APP_ENV", "local"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        database_url=database_url,
        llm_api_key=os.environ.get("LLM_API_KEY"),
        # Which BridgeLLM-served model to call (see llm_client.py's module
        # docstring for which of the proxy's advertised models actually serve
        # a request) - overridable via env without a redeploy, since the
        # proxy's working set has shifted before.
        llm_model=os.environ.get("LLM_MODEL", "gemini-flash-latest"),
        deepseek_api_key=os.environ.get("DEEPSEEK_API_KEY"),
        # Defaults match the verified-working local fallback server, so this
        # keeps working even in environments where the .env var isn't set.
        ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://124.123.18.150:11434/v1"),
        ollama_model=os.environ.get("OLLAMA_MODEL", "qwen3:14b"),
        auth_gateway_base_url=os.environ.get("AUTH_GATEWAY_BASE_URL", "https://auth.nervesparks.com"),
        auth_gateway_prefix=os.environ.get("AUTH_GATEWAY_PREFIX", "/api/v1/auth"),
        auth_jwks_url=auth_jwks_url,
        auth_issuer=auth_issuer,
        auth_audience=auth_audience,
        auth_verify_claims=os.environ.get("AUTH_VERIFY_CLAIMS", "").lower() in ("1", "true", "yes"),
        auth_jwks_cache_ttl_seconds=int(auth_ttl),
        auth_tenant_id=os.environ.get("AUTH_TENANT_ID"),
        scraper_service_url=os.environ.get("SCRAPER_SERVICE_URL"),
        scraper_api_key=os.environ.get("SCRAPER_API_KEY"),
        tavily_api_key=os.environ.get("TAVILY_API_KEY"),
        you_api_key=os.environ.get("YOU_API_KEY"),
        research_concurrency=research_concurrency,
        # Default headroom: research_concurrency's worth of long-lived
        # research sessions, plus scoring's own chunk concurrency (3) and
        # normal request traffic, split across a base pool + overflow.
        db_pool_size=int(os.environ.get("DB_POOL_SIZE", str(max(research_concurrency, 5) + 5))),
        db_max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", str(max(research_concurrency, 5) + 5))),
    )
