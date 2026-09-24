"""Onboarding prefill from a tenant website via you.com + LLM.

Research extracts organisation fields and an offering profile (what the
tenant sells). Ideal Customer Profiles are created only on the ICP page —
never auto-created from this flow.
"""

from __future__ import annotations

import json
import re
from urllib.parse import urlparse

from app.services import llm_client, you_client

_URL_SCHEME = re.compile(r"^https?://", re.I)


def _normalize_website(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if not _URL_SCHEME.match(raw):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if not parsed.netloc or "." not in parsed.netloc:
        return None
    return raw.rstrip("/")


def _domain_from_url(url: str) -> str | None:
    parsed = urlparse(url if _URL_SCHEME.match(url) else f"https://{url}")
    host = (parsed.netloc or "").lower()
    host = re.sub(r"^www\.", "", host)
    return host or None


def _results_to_text(results: list[dict], max_chars: int = 14000) -> str:
    chunks: list[str] = []
    for i, item in enumerate(results):
        title = (item.get("title") or "").strip()
        link = (item.get("link") or "").strip()
        snippet = (item.get("snippet") or "").strip()
        if not snippet and not title:
            continue
        chunks.append(f"[{i + 1}] {title}\nURL: {link}\n{snippet}")
    text = "\n\n".join(chunks)
    return text[:max_chars]


async def gather_website_research_text(website: str) -> str:
    domain = _domain_from_url(website)
    if not domain:
        return ""
    queries = [
        f"site:{domain}",
        f"{domain} company about products services headquarters industry",
        f"{domain} offerings solutions products what they sell",
    ]
    seen_links: set[str] = set()
    merged: list[dict] = []
    for query in queries:
        try:
            batch = await you_client.search_query(query, num=12)
        except Exception:
            continue
        print(f"[YOU.COM] query={query!r} -> {len(batch)} result(s)")
        print(json.dumps(batch, indent=2, default=str))
        for item in batch:
            link = str(item.get("link") or "")
            if link and link in seen_links:
                continue
            if link:
                seen_links.add(link)
            merged.append(item)
        if len(merged) >= 24:
            break
    return _results_to_text(merged)



def _parse_json_object(raw: str) -> dict | None:
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def prefill_from_website(website: str) -> dict:
    """Returns { organisation, offering_profile } with nulls where unknown."""
    normalized = _normalize_website(website)
    empty = {
        "website": normalized,
        "organisation": {},
        "offering_profile": None,
        "status": "unavailable",
    }
    if normalized is None:
        empty["status"] = "invalid_url"
        return empty
    if not you_client.is_configured() or not llm_client.is_configured():
        empty["status"] = "not_configured"
        return empty

    snippets = await gather_website_research_text(normalized)
    if not snippets.strip():
        empty["status"] = "no_results"
        return empty

    template = json.dumps(
        {
            "organisation": {
                "company_name": "",
                "legal_business_name": "",
                "industry": "",
                "sub_industry": "",
                "headquarters_location": "",
                "founded_year": "",
                "employee_count_range": "",
                "annual_revenue_range": "",
                "business_type": "",
                "company_description": "",
            },
            "offering_profile": {
                "company": "",
                "positioning": "",
                "offerings": [
                    {
                        "name": "",
                        "problems_solved": [],
                        "technologies": [],
                        "buying_signals": [],
                    }
                ],
                "problems_solved": [],
                "relevant_technologies": [],
                "alternative_solutions": [{"category": "", "inferred": True}],
                "accelerators": [],
            },
        },
        indent=2,
    )
    prompt = (
        f"You are analysing public web snippets about the company whose website is {normalized}. "
        "Infer what you can honestly support from the snippets only.\n\n"
        "Rules:\n"
        "- Leave fields empty or null when not supported by the snippets.\n"
        "- offering_profile describes what THIS company SELLS "
        "(products, services, problems solved, technologies) — not who they sell to.\n"
        "- alternative_solutions are solution categories, not invented competitor names.\n\n"
        f"Respond with ONLY this JSON shape:\n{template}\n\n"
        f"Snippets:\n{snippets}"
    )
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": prompt}],
            generation_name="onboarding-website-prefill",
        )
    except Exception:
        empty["status"] = "llm_failed"
        return empty

    parsed = _parse_json_object(raw)
    if not parsed:
        empty["status"] = "parse_failed"
        return empty

    org_block = parsed.get("organisation") if isinstance(parsed.get("organisation"), dict) else {}
    offering = parsed.get("offering_profile") if isinstance(parsed.get("offering_profile"), dict) else None

    if offering:
        offering["source_url"] = normalized

    return {
        "website": normalized,
        "organisation": org_block,
        "offering_profile": offering,
        "status": "ok",
    }
