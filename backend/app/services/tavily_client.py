"""Tavily Advanced Search (api.tavily.com) client - the live web-research
source for the scoop/news fields ZoomInfo exports no longer carry (see
signal_extractor). Replaces serper_client.py.

Exactly ONE Tavily call per company (not two): a single broad query -
company name + domain + a dense buying-signal keyword set - covers both
third-party coverage (funding, leadership, partnerships, procurement) and the
company's own site content in one search_depth="advanced" request, since
Tavily ranks by relevance across the whole web rather than needing Google-
style separate site:/news queries.
"""

import re
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

SEARCH_URL = "https://api.tavily.com/search"
# Confirmed live Tavily accepts >15 (tested 20/25/30, all returned in full) -
# 20 gets more recall (more chance of finding genuinely separate real events)
# without diluting too far into low-relevance long-tail results.
MAX_RESULTS = 20

# Same buying-intent vocabulary as the old news/site queries, merged into one
# keyword-dense query string. Tavily does hybrid semantic+keyword retrieval,
# not Google boolean operators, so these are plain terms rather than an
# OR-group / site: filter.
BUYING_SIGNAL_TERMS = (
    "funding acquisition merger appointed leadership launched partnership "
    "investment transformation automation RFP procurement pilot expansion "
    "modernization hiring careers platform announces press release"
)

# source_type per domain (brief section 9 / SOURCE_QUALITY in scoring_config).
# Substring match against the result's domain; falls through to "unknown".
_SOURCE_TYPE_RULES = [
    ("official", (".gov", "sam.gov", "ted.europa.eu", "procurement")),
    ("reputable_independent", ("reuters.com", "bloomberg.com", "wsj.com", "ft.com", "forbes.com", "techcrunch.com")),
    ("industry_publication", ("fiercehealthcare", "mobihealthnews", "manufacturing", "industryweek", "healthcare")),
    ("aggregator", ("tracxn.com", "crunchbase.com", "linkedin.com", "wikipedia.org", "msn.com")),
    ("company_press", ("businesswire.com", "prnewswire.com", "newswire.com", "globenewswire.com")),
]


class TavilyError(Exception):
    pass


class TavilyNotConfiguredError(TavilyError):
    pass


def is_configured() -> bool:
    return bool(get_settings().tavily_api_key)


def _headers() -> dict:
    settings = get_settings()
    if not settings.tavily_api_key:
        raise TavilyNotConfiguredError("TAVILY_API_KEY is not set in the environment")
    return {"Authorization": f"Bearer {settings.tavily_api_key}", "Content-Type": "application/json"}


def build_query(domain: str, company_name: str | None = None) -> str:
    subject = f"{company_name} ({domain})" if company_name else domain
    return f"{subject} recent news: {BUYING_SIGNAL_TERMS}"


async def search(domain: str, company_name: str | None = None, num: int = MAX_RESULTS) -> list[dict]:
    """The single research call for one company. Returns a list of dicts
    shaped like { link, title, snippet, date, position } - Tavily's own
    result fields (url/content/published_date) normalised into the same
    shape the rest of the pipeline (is_relevant/to_evidence) expects."""
    query = build_query(domain, company_name)
    payload = {
        "query": query,
        "search_depth": "advanced",
        "topic": "general",
        "max_results": num,
        "include_answer": False,
        "include_raw_content": False,
    }
    print(f"[TAVILY] >>> Calling Tavily Advanced Search for '{company_name}' ({domain})")
    print(f"[TAVILY]     query: {query!r}")
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(SEARCH_URL, headers=_headers(), json=payload)
    if response.status_code != 200:
        print(f"[TAVILY] <<< FAILED ({response.status_code}) for '{company_name}': {response.text[:200]}")
        raise TavilyError(f"Tavily search failed ({response.status_code}): {response.text}")
    results = response.json().get("results", [])
    print(f"[TAVILY] <<< Got {len(results)} raw results for '{company_name}' "
          f"(status={response.status_code})")
    for i, r in enumerate(results[:5]):
        print(f"[TAVILY]     [{i}] {r.get('title')!r} -> {r.get('url')}")
    if len(results) > 5:
        print(f"[TAVILY]     ... and {len(results) - 5} more")
    return [
        {
            "link": r.get("url"),
            "title": r.get("title"),
            "snippet": r.get("content"),
            "date": r.get("published_date"),
            "position": i,
        }
        for i, r in enumerate(results)
    ]


_DOMAIN_LABEL_RE = re.compile(r"[^a-z0-9]+")


def _domain_label(domain: str) -> str:
    """The registrable-name portion of a domain, lowercased and stripped of
    punctuation, for relevance matching - "provenir.com" -> "provenir",
    "21stcenturyvitamins.com" -> "21stcenturyvitamins"."""
    host = domain.lower().split("/")[0]
    parts = host.split(".")
    label = parts[-2] if len(parts) >= 2 else parts[0]
    return _DOMAIN_LABEL_RE.sub("", label)


def is_relevant(domain: str, company_name: str | None, item: dict) -> bool:
    """Whether a result is actually about this company rather than a
    same-name collision - true if the domain's label or the company name
    appears in the result's title/snippet/link."""
    haystack = " ".join(
        filter(None, [item.get("title"), item.get("snippet"), item.get("link")])
    ).lower()
    label = _domain_label(domain)
    if label and label in haystack:
        return True
    if company_name:
        name = re.sub(r"[^a-z0-9 ]+", "", company_name.lower()).strip()
        if name and name in haystack:
            return True
    return False


def match_confidence(domain: str, company_name: str | None, item: dict) -> float:
    """How confident we are this result is about THIS company (brief item 17) -
    a real value, not a hardcoded 0.95. Highest when the exact domain label
    appears, lower when only the company name matches, lowest when neither
    does (kept the result for another reason)."""
    haystack = " ".join(filter(None, [item.get("title"), item.get("snippet"), item.get("link")])).lower()
    label = _domain_label(domain)
    if label and label in haystack:
        return 0.95
    if company_name:
        name = re.sub(r"[^a-z0-9 ]+", "", company_name.lower()).strip()
        if name and name in haystack:
            return 0.8
    return 0.55


def _result_domain(link: str | None) -> str | None:
    if not link:
        return None
    try:
        return urlparse(link).netloc.lower() or None
    except ValueError:
        return None


def classify_source_type(link: str | None) -> str:
    """Maps a result URL to a source_type bucket (feeds SOURCE_QUALITY in
    scoring). Substring match on the domain; "unknown" if nothing matches."""
    domain = _result_domain(link) or ""
    for source_type, needles in _SOURCE_TYPE_RULES:
        if any(n in domain for n in needles):
            return source_type
    return "unknown"


def to_evidence(item: dict, query: str, query_type: str, retrieved_at_iso: str, company_domain: str | None = None) -> dict:
    """Normalises one Tavily result into the evidence record the
    buying_event layer stores (brief section 9): every field needed to
    audit, dedup, and score the source later.

    source_type: a result on the COMPANY'S OWN domain is 'company_press',
    never 'unknown' (brief item 16) - detected purely via domain match since
    a single unified query no longer distinguishes "news" vs "site" results."""
    link = item.get("link")
    result_domain = _result_domain(link)
    source_type = classify_source_type(link)
    if company_domain:
        label = _domain_label(company_domain)
        if result_domain and label and label in result_domain:
            source_type = "company_press"
    return {
        "url": link,
        "domain": result_domain,
        "title": item.get("title"),
        "snippet": item.get("snippet"),
        "published_date": item.get("date"),
        "search_query": query,
        "query_type": query_type,
        "retrieved_at": retrieved_at_iso,
        "source_type": source_type,
        "position": item.get("position"),
    }
