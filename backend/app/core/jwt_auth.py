"""NervesParks auth-gateway JWT verification (RS256 via JWKS).

Verification only — this service never issues tokens. Keys are fetched from
the gateway and cached; there is no per-request call to the gateway.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from jose import JWTError, jwt

from app.core.config import get_settings

_JWKS_CACHE: dict[str, Any] = {"keys": [], "expires_at": 0.0}


def _resolve_jwks_url() -> str:
    settings = get_settings()
    if settings.auth_jwks_url:
        return settings.auth_jwks_url
    base = settings.auth_gateway_base_url.rstrip("/")
    prefix = settings.auth_gateway_prefix.strip("/")
    return f"{base}/{prefix}/.well-known/jwks.json"


def _fetch_jwks() -> list[dict[str, Any]]:
    settings = get_settings()
    now = time.time()
    if _JWKS_CACHE["keys"] and _JWKS_CACHE["expires_at"] > now:
        return _JWKS_CACHE["keys"]

    response = httpx.get(_resolve_jwks_url(), timeout=10.0)
    response.raise_for_status()
    payload = response.json()
    # Gateway wraps as {"status_code": 200, "data": {"keys": [...]}}.
    # Some deployments return plain JWKS ({"keys": [...]}) — support both.
    keys = payload.get("keys") or (payload.get("data") or {}).get("keys") or []
    _JWKS_CACHE["keys"] = keys
    _JWKS_CACHE["expires_at"] = now + settings.auth_jwks_cache_ttl_seconds
    return keys


def verify_auth_gateway_token(token: str) -> dict[str, Any] | None:
    """Verify an RS256 JWT issued by the NervesParks auth gateway.

    Returns the decoded claims dict, or None if the token is missing/invalid.
    """
    if not token or not isinstance(token, str) or not token.strip():
        return None

    settings = get_settings()
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        keys = _fetch_jwks()
        signing_key = next((k for k in keys if k.get("kid") == kid), None)
        if not signing_key:
            # Key rotation: refetch once before giving up.
            _JWKS_CACHE["expires_at"] = 0.0
            keys = _fetch_jwks()
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
