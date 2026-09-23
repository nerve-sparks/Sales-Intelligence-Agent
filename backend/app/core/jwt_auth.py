"""NervesParks auth-gateway JWT verification (RS256 via JWKS).

Verification only — this service never issues tokens. Keys are fetched from
the gateway and cached; there is no per-request call to the gateway.

Availability note: a JWKS fetch failure must NEVER invalidate a session. The
signing keys we already hold stay valid for months, so when the gateway is
briefly unreachable we keep verifying with the cached copy instead of
rejecting every request. Returning None here becomes a 401, and the frontend
treats a 401 as "signed out" — so a one-second network blip against
auth.nervesparks.com used to log every active user out. The cache TTL is only
300s in .env, so that refetch window came round every five minutes.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from jose import JWTError, jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_JWKS_CACHE: dict[str, Any] = {"keys": [], "expires_at": 0.0}

# While the gateway is failing we keep serving the cached keys, but still want
# to notice when it comes back. Retry on this cadence rather than on every
# single request, which would put a (slow, ~1s) network call in front of the
# whole API for as long as the outage lasts.
_STALE_RETRY_INTERVAL_SECONDS = 30.0

# An unrecognised `kid` triggers one out-of-band refetch to pick up a rotated
# key. That path is reachable by anyone holding any token, so it is throttled:
# without this, tokens signed by another environment (or simply stale ones)
# force a gateway round trip on every request they make.
_FORCED_REFETCH_MIN_INTERVAL_SECONDS = 60.0
_last_forced_refetch = 0.0


def _resolve_jwks_url() -> str:
    settings = get_settings()
    if settings.auth_jwks_url:
        return settings.auth_jwks_url
    base = settings.auth_gateway_base_url.rstrip("/")
    prefix = settings.auth_gateway_prefix.strip("/")
    return f"{base}/{prefix}/.well-known/jwks.json"


async def _fetch_jwks(*, force: bool = False) -> list[dict[str, Any]]:
    """Cached JWKS keys. Falls back to the cached copy whenever the gateway
    cannot be reached, so an outage degrades to "keys may be stale" rather
    than "everyone is logged out"."""
    settings = get_settings()
    now = time.time()
    cached: list[dict[str, Any]] = _JWKS_CACHE["keys"]

    if cached and not force and _JWKS_CACHE["expires_at"] > now:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(_resolve_jwks_url())
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Stale keys still verify correctly - only give up when we have none
        # at all (cold start during an outage), which the caller turns into a
        # 401 because there is genuinely nothing to verify against.
        _JWKS_CACHE["expires_at"] = now + _STALE_RETRY_INTERVAL_SECONDS
        logger.warning(
            "JWKS fetch failed (%s: %s); %s",
            type(exc).__name__,
            exc,
            "continuing with cached keys" if cached else "no cached keys available",
        )
        return cached

    # Gateway wraps as {"status_code": 200, "data": {"keys": [...]}}.
    # Some deployments return plain JWKS ({"keys": [...]}) — support both.
    keys = payload.get("keys") or (payload.get("data") or {}).get("keys") or []
    if not keys:
        # A 200 with no keys is a gateway-side problem, not a reason to drop a
        # working key set on the floor.
        _JWKS_CACHE["expires_at"] = now + _STALE_RETRY_INTERVAL_SECONDS
        logger.warning("JWKS response contained no keys; keeping %d cached key(s)", len(cached))
        return cached

    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["expires_at"] = now + settings.auth_jwks_cache_ttl_seconds
    return keys


async def verify_auth_gateway_token(token: str) -> dict[str, Any] | None:
    """Verify an RS256 JWT issued by the NervesParks auth gateway.

    Returns the decoded claims dict, or None if the token is missing/invalid.
    """
    global _last_forced_refetch

    if not token or not isinstance(token, str) or not token.strip():
        return None

    settings = get_settings()
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        keys = await _fetch_jwks()
        signing_key = next((k for k in keys if k.get("kid") == kid), None)
        if not signing_key:
            # Key rotation: refetch once before giving up, at most once a
            # minute so an unknown kid can't turn into a fetch per request.
            now = time.time()
            if now - _last_forced_refetch >= _FORCED_REFETCH_MIN_INTERVAL_SECONDS:
                _last_forced_refetch = now
                keys = await _fetch_jwks(force=True)
                signing_key = next((k for k in keys if k.get("kid") == kid), None)
        if not signing_key:
            return None

        # Issuer/audience vary across gateway deployments — verify signature
        # only by default (same as the org integration guide). Opt in with
        # AUTH_VERIFY_CLAIMS=1 when your deployment's iss/aud are stable.
        decode_kwargs: dict[str, Any] = {
            "algorithms": ["RS256"],
            "options": {"verify_aud": False, "verify_iss": False},
        }
        if settings.auth_verify_claims:
            if settings.auth_audience:
                decode_kwargs["audience"] = settings.auth_audience
                decode_kwargs["options"]["verify_aud"] = True
            if settings.auth_issuer:
                decode_kwargs["issuer"] = settings.auth_issuer
                decode_kwargs["options"]["verify_iss"] = True

        return jwt.decode(token, signing_key, **decode_kwargs)
    except (JWTError, httpx.HTTPError, ValueError, KeyError):
        return None
