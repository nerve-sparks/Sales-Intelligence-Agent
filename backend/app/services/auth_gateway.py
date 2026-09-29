"""Proxy for the NervesParks auth-gateway's session endpoints.

The frontend sends login / register / refresh / logout here instead of
calling the gateway directly, so the browser only ever talks to this API.
Tokens are still ISSUED by the gateway - this service passes the request
through and hands the gateway's response back unchanged (status + JSON body),
so the frontend's token/error parsing works exactly as it did against the
gateway. Request bodies carry passwords/tokens and are never logged.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 15.0


def _gateway_url(path: str) -> str:
    settings = get_settings()
    base = settings.auth_gateway_base_url.rstrip("/")
    prefix = settings.auth_gateway_prefix.strip("/")
    return f"{base}/{prefix}/{path.lstrip('/')}"


async def forward(path: str, body: dict[str, Any]) -> tuple[int, Any]:
    """POST `body` to the gateway's `path`; returns (status_code, json_body).

    A gateway that can't be reached or answers 5xx maps to 502/504 - the
    frontend treats any 5xx on /refresh as "gateway unavailable" (keep the
    session) rather than "refresh token rejected" (sign out), so that
    distinction has to survive the extra hop.
    """
    url = _gateway_url(path)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.post(url, json=body)
    except httpx.TimeoutException:
        logger.warning("Auth gateway timed out on %s", path)
        return 504, {"detail": "Authentication service timed out. Please try again."}
    except httpx.HTTPError as exc:
        logger.warning("Auth gateway unreachable on %s: %s", path, type(exc).__name__)
        return 502, {"detail": "Authentication service is unavailable. Please try again."}

    try:
        payload = response.json()
    except ValueError:
        payload = {"detail": response.text[:500] or f"Authentication failed ({response.status_code})"}

    if response.status_code >= 500:
        logger.warning("Auth gateway returned %s on %s", response.status_code, path)
        return 502, payload

    return response.status_code, payload


def default_tenant_id() -> str:
    # The gateway's register schema still requires tenant_id; login never does.
    return get_settings().auth_tenant_id or "default"
