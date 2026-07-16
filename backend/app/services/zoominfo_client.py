"""ZoomInfo REST API client - Client Credentials Flow auth + a generic
JSON:API request helper shared by every Enrich endpoint.

NOTE: written against ZoomInfo's published API docs (docs.zoominfo.com),
not yet exercised against a live account - no ZOOMINFO_CLIENT_ID/SECRET
have been available to test with. Verify the token endpoint and error
handling here against a real account before relying on this in production.
"""

import time

import httpx

from app.core.config import get_settings

TOKEN_URL = "https://api.zoominfo.com/gtm/oauth/v1/token"
BASE_URL = "https://api.zoominfo.com/gtm/data/v1"

# Refresh a bit before actual expiry to avoid a request failing mid-flight
# on an access token that expires between the check and the call.
TOKEN_REFRESH_MARGIN_SECONDS = 30

_cached_token: str | None = None
_cached_token_expires_at: float = 0.0


class ZoomInfoAPIError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"ZoomInfo API error {status_code}: {detail}")


class ZoomInfoNotConfiguredError(Exception):
    pass


async def _get_access_token() -> str:
    global _cached_token, _cached_token_expires_at

    if _cached_token and time.monotonic() < _cached_token_expires_at:
        return _cached_token

    settings = get_settings()
    if not settings.zoominfo_client_id or not settings.zoominfo_client_secret:
        raise ZoomInfoNotConfiguredError(
            "ZOOMINFO_CLIENT_ID / ZOOMINFO_CLIENT_SECRET are not set in the environment"
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "client_credentials",
                "client_id": settings.zoominfo_client_id,
                "client_secret": settings.zoominfo_client_secret,
            },
        )

    if response.status_code != 200:
        raise ZoomInfoAPIError(response.status_code, response.text)

    body = response.json()
    _cached_token = body["access_token"]
    expires_in = body.get("expires_in", 300)
    _cached_token_expires_at = time.monotonic() + expires_in - TOKEN_REFRESH_MARGIN_SECONDS
    return _cached_token


async def post(resource_path: str, resource_type: str, attributes: dict, query_params: dict | None = None) -> dict:
    """POSTs a JSON:API-shaped request to a ZoomInfo data endpoint and
    returns the parsed JSON response.

    resource_path: e.g. "companies/enrich"
    resource_type: e.g. "CompanyEnrich" - goes in data.type
    attributes: goes in data.attributes (matchCompanyInput, outputFields, etc.)
    """
    token = await _get_access_token()

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{BASE_URL}/{resource_path}",
            params=query_params or {},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
            },
            json={"data": {"type": resource_type, "attributes": attributes}},
        )

    if response.status_code != 200:
        raise ZoomInfoAPIError(response.status_code, response.text)

    return response.json()
