"""Nexus Scraper client - submit-and-poll web scraping (SCRAPER_SERVICE_URL /
SCRAPER_API_KEY in .env). Replaces the postponed Tavily search plan as the
source for company signal content: scrape() feeds one URL's page content to
signal_llm the same way CompanyNews/CompanyScoop rows used to.

Contract: POST /public/scrape (or /public/scrape/batch) either returns a
cached result immediately or a job_id/batch_id to poll at /public/result/...
until status is "done"/"complete" (or "failed")."""

import asyncio

import httpx

from app.core.config import get_settings

POLL_INTERVAL_SECONDS = 3
MAX_POLL_ATTEMPTS = 600  # 30 minutes
VALID_OUTPUT_FORMATS = {"markdown", "plaintext", "html", "json"}


class ScraperError(Exception):
    pass


class ScraperNotConfiguredError(ScraperError):
    pass


def is_configured() -> bool:
    settings = get_settings()
    return bool(settings.scraper_service_url and settings.scraper_api_key)


def _base_url_and_headers() -> tuple[str, dict]:
    settings = get_settings()
    if not settings.scraper_service_url or not settings.scraper_api_key:
        raise ScraperNotConfiguredError("SCRAPER_SERVICE_URL / SCRAPER_API_KEY not set in the environment")
    return settings.scraper_service_url.rstrip("/"), {
        "X-API-Key": settings.scraper_api_key,
        "Content-Type": "application/json",
    }


async def scrape(url: str, output_format: str = "markdown") -> str:
    """Scrapes a single URL, polling until the job finishes. Returns the
    scraped content (empty string only if the service itself returns none)."""
    if output_format not in VALID_OUTPUT_FORMATS:
        raise ValueError(f"Invalid output_format: {output_format}. Must be one of {VALID_OUTPUT_FORMATS}")
    base_url, headers = _base_url_and_headers()

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{base_url}/public/scrape", headers=headers, json={"url": url, "output_format": output_format}
        )
        response.raise_for_status()
        result = response.json()

        if result.get("status") == "cached":
            return result.get("result", "")

        job_id = result.get("job_id")
        if not job_id:
            raise ScraperError(f"No job_id returned for {url}")

        poll_url = f"{base_url}/public/result/{job_id}"
        for _ in range(MAX_POLL_ATTEMPTS):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            poll = await client.get(poll_url, headers=headers)
            poll.raise_for_status()
            data = poll.json()
            status = data.get("status")
            if status == "done":
                return data.get("content", "")
            if status == "failed":
                raise ScraperError(f"Scraping failed for {url}: {data.get('error', 'unknown error')}")
            # "queued" | "processing" -> keep polling

    raise ScraperError(f"Timed out waiting for job {job_id} ({url})")


async def scrape_batch(urls: list[str], output_format: str = "markdown") -> list[dict]:
    """Scrapes multiple URLs as one job. Returns a list of
    {"url", "status", "content"} dicts in the same order as `urls` - a URL
    missing from the service's response (or itself marked failed) comes back
    with status "failed" and empty content rather than being dropped, so the
    caller's output list always lines up 1:1 with its input list."""
    if not urls:
        return []
    if output_format not in VALID_OUTPUT_FORMATS:
        raise ValueError(f"Invalid output_format: {output_format}. Must be one of {VALID_OUTPUT_FORMATS}")
    base_url, headers = _base_url_and_headers()

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{base_url}/public/scrape/batch", headers=headers, json={"urls": urls, "output_format": output_format}
        )
        response.raise_for_status()
        result = response.json()
        batch_id = result.get("batch_id")
        if not batch_id:
            raise ScraperError("No batch_id returned from scraper service")

        poll_url = f"{base_url}/public/result/batch/{batch_id}"
        for _ in range(MAX_POLL_ATTEMPTS):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            poll = await client.get(poll_url, headers=headers)
            poll.raise_for_status()
            data = poll.json()
            status = data.get("status")

            if status == "complete":
                by_url = {}
                for job in data.get("results", []):
                    job_url = (job.get("url") or "").rstrip("/")
                    job_status = job.get("status")
                    by_url[job_url] = {
                        "url": job_url,
                        "status": job_status,
                        "content": job.get("result", "") if job_status == "done" else "",
                    }
                return [by_url.get(u.rstrip("/"), {"url": u, "status": "failed", "content": ""}) for u in urls]

            if status == "failed":
                raise ScraperError(f"Batch scraping failed: {data}")
            # "queued" | "in_progress" -> keep polling

    raise ScraperError(f"Timed out waiting for batch {batch_id}")
