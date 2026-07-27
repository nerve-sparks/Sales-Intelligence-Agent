"""Serper.dev (google.serper.dev) client - the live replacement for the
scoop/news fields ZoomInfo exports no longer carry (see signal_extractor).

Two query shapes per company, both validated against real data before this
was written (Provenir, 21st Century Healthcare/21stcenturyvitamins.com,
Sharecare):

- news query: third-party coverage (funding, acquisition, leadership,
  launches, partnerships) via a plain keyword query with a -site: exclusion
  and an after: date filter. Confirmed empirically flaky - the identical
  query returned 0 results on 1 of 4 back-to-back attempts even when real
  results existed - so this one gets retried before an empty result is
  trusted.
- site query: the company's own site (leadership/careers/platform/partners/
  announces pages). Confirmed consistent (10/10 across repeat attempts) and
  needs no retry.

Exact-phrase quoting (`"domain.com"`) would sharpen the news query further
(it's what actually anchors a generic company name like "Provenir" to the
right business) but the free Serper plan rejects any query containing a
quoted phrase with a 400 ("Query pattern not allowed for free accounts") -
quote_domain() below is unused while on the free plan and only takes effect
once the account is upgraded.
"""

import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

SEARCH_URL = "https://google.serper.dev/search"
NEWS_QUERY_LOOKBACK_DAYS = 545  # ~18 months, matches signal_extractor's m3_recency decay bands
NEWS_QUERY_MAX_RETRIES = 2  # empirically ~25% of identical news queries come back spuriously empty
# Broadened buying-intent term group (brief section 9). Kept as an OR-group of
# the highest-value buying signals rather than all ~40 candidate terms crammed
# into one query - a bloated query dilutes ranking, and the LLM does the actual
# fine-grained event-type classification downstream (buying_event_service). OR
# and -site:/after: are confirmed working on Serper's free tier; exact-phrase
# quotes are not (see module docstring / SERPER_TEST_CASES.md).
# Broadened buying-intent terms (brief section 9). Single-word OR terms ONLY -
# Serper's free tier rejects any query containing an exact-phrase quote
# ("Query pattern not allowed for free accounts"), so multi-word concepts are
# represented by their most distinctive single word (transformation, automation,
# procurement, pilot, expansion...). The LLM does the fine-grained event-type
# classification downstream. OR / -site: / after: are confirmed free-tier-safe.
NEWS_KEYWORDS = (
    "funding OR acquisition OR merger OR appointed OR launched OR partnership OR "
    "investment OR transformation OR automation OR RFP OR procurement OR pilot OR "
    "expansion OR modernization OR hiring"
)
SITE_QUERY_TERMS = "leadership OR careers OR platform OR partners OR announces OR automation OR press"

# source_type per domain (brief section 9 / SOURCE_QUALITY in scoring_config).
# Substring match against the result's domain; falls through to "unknown".
_SOURCE_TYPE_RULES = [
    ("official", (".gov", "sam.gov", "ted.europa.eu", "procurement")),
    ("reputable_independent", ("reuters.com", "bloomberg.com", "wsj.com", "ft.com", "forbes.com", "techcrunch.com")),
    ("industry_publication", ("fiercehealthcare", "mobihealthnews", "manufacturing", "industryweek", "healthcare")),
    ("aggregator", ("tracxn.com", "crunchbase.com", "linkedin.com", "wikipedia.org", "msn.com")),
    ("company_press", ("businesswire.com", "prnewswire.com", "newswire.com", "globenewswire.com")),
]


class SerperError(Exception):
    pass


class SerperNotConfiguredError(SerperError):
    pass


def is_configured() -> bool:
    return bool(get_settings().serper_api_key)


def _headers() -> dict:
    settings = get_settings()
    if not settings.serper_api_key:
        raise SerperNotConfiguredError("SERP_API_KEY (Serper.dev) is not set in the environment")
    return {"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"}


def quote_domain(domain: str) -> str:
    """Wraps a domain in exact-phrase quotes. Only usable once the Serper
    account is on a paid plan - see module docstring."""
    return f'"{domain}"'


def build_news_query(domain: str) -> str:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=NEWS_QUERY_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    return f"{domain} {NEWS_KEYWORDS} -site:{domain} after:{cutoff}"


def build_site_query(domain: str) -> str:
    return f"site:{domain} ({SITE_QUERY_TERMS})"


async def _post_search(client: httpx.AsyncClient, query: str, num: int) -> list[dict]:
    response = await client.post(SEARCH_URL, headers=_headers(), json={"q": query, "num": num})
    if response.status_code != 200:
        raise SerperError(f"Serper search failed ({response.status_code}): {response.text}")
    return response.json().get("organic", [])


async def search(query: str, num: int = 10) -> list[dict]:
    """One search call. Returns Serper's `organic` results list verbatim
    (each item: title, link, snippet, date)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await _post_search(client, query, num)


async def search_news(domain: str, num: int = 10) -> list[dict]:
    """The news query, with the empirically-needed retry: identical queries
    have come back empty ~25% of the time even when real results exist, so
    an empty result is retried before being trusted as "no signal"."""
    query = build_news_query(domain)
    async with httpx.AsyncClient(timeout=30.0) as client:
        results = await _post_search(client, query, num)
        attempt = 1
        while not results and attempt <= NEWS_QUERY_MAX_RETRIES:
            results = await _post_search(client, query, num)
            attempt += 1
        return results


async def search_site(domain: str, num: int = 10) -> list[dict]:
    query = build_site_query(domain)
    return await search(query, num)


async def _post_batch(client: httpx.AsyncClient, queries: list[tuple[str, int]]) -> list[list[dict]]:
    """Serper.dev accepts a JSON array of {q, num} objects at the same
    /search endpoint and runs them as one batched request, returning one
    result set per query in order - confirmed against the live API (a plain
    object still works for a single query; an array runs several as one
    HTTP call, one Serper credit charge each but a single round trip)."""
    payload = [{"q": q, "num": n} for q, n in queries]
    response = await client.post(SEARCH_URL, headers=_headers(), json=payload)
    if response.status_code != 200:
        raise SerperError(f"Serper batch search failed ({response.status_code}): {response.text}")
    return [item.get("organic", []) for item in response.json()]


async def search_news_and_site(domain: str, num: int = 10) -> tuple[list[dict], list[dict]]:
    """Both query shapes (news + site) in ONE Serper API call instead of two
    separate calls - halves the per-company request count in the common
    case. The news query keeps its empirically-needed retry (~25% spurious-
    empty rate, see module docstring) as a single follow-up call for just
    that query rather than re-running the whole batch, so the common case
    stays at exactly 1 HTTP call and only the news-empty case costs 2."""
    news_query = build_news_query(domain)
    site_query = build_site_query(domain)
    async with httpx.AsyncClient(timeout=30.0) as client:
        news_results, site_results = await _post_batch(client, [(news_query, num), (site_query, num)])
        attempt = 1
        while not news_results and attempt <= NEWS_QUERY_MAX_RETRIES:
            news_results = await _post_search(client, news_query, num)
            attempt += 1
        return news_results, site_results


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
    same-name collision (see Provenir vs. the unrelated provenir.com.au meat
    brand) - true if the domain's label or the company name appears in the
    result's title/snippet/link."""
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
    """Normalises one Serper organic result into the evidence record the
    buying_event layer stores (brief section 9): every field needed to
    audit, dedup, and score the source later.

    source_type: a result on the COMPANY'S OWN domain (or a site-scoped query)
    is 'company_press', never 'unknown' (brief item 16) - a company's own site
    is a known, lower-neutrality source, distinct from independent reporting."""
    link = item.get("link")
    result_domain = _result_domain(link)
    source_type = classify_source_type(link)
    if company_domain:
        label = _domain_label(company_domain)
        if (query_type == "site" or (result_domain and label and label in result_domain)):
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
