"""you.com Search (api.you.com/v1/search) - the live web-research source for
buying evidence. Replaces tavily_client.py, and exposes the same public
interface (search / build_query / is_relevant / match_confidence /
classify_source_type / to_evidence / is_configured) so buying_event_service
and search_signal_ingest swap providers by changing an import.

Why this replaced Tavily, measured on the identical query:

  * Publish dates. you.com returns `page_age` per result - 16 of 20 populated
    for Inseego. Tavily returned `published_date=None` on 20 of 20, for every
    company checked. That single gap is what corrupted scoring: with no date
    the extraction LLM inferred one, and for undated pages it inferred TODAY,
    handing `freshness=1.0` to homepages and product pages. Premier Coil
    Solutions scored 100/100 "Sales Ready" off six such pages (its homepage,
    control-systems page, about page, Facebook, LinkedIn, a LeadIQ profile) -
    every one stamped with the research date. Real dates make
    FRESHNESS_UNKNOWN_DATE reachable and stop that class of inflation.

  * A separate `news` bucket, so buying-signal keywords no longer have to be
    stuffed into the query to surface news (see build_query).

Two behaviours to know about:

  1. The endpoint is api.you.com/v1/search with an `X-API-Key` header. The
     older api.ydc-index.io hosts 403 on this key, and chat-api.you.com
     (the synthesised answer+citations surface) 401s - it is a separate
     product entitlement, not this key.

  2. When a company has no genuine news coverage, the news bucket does NOT
     return empty - it falls back to unrelated trending articles. A live probe
     for Premier Coil Solutions returned "Fans react to Jonas Brothers
     announcement" and "When is the 'Dancing with the Stars' cast reveal?",
     all confidently dated. is_relevant() is therefore load-bearing rather
     than a nicety: it requires the domain label or company name to actually
     appear in the result, which drops every one of those. Never bypass it.
"""

import re
from urllib.parse import urlparse

import httpx

from app.core.config import get_settings

SEARCH_URL = "https://api.you.com/v1/search"
# The API returns up to 10 web + 10 news per query; there is no count
# parameter to raise that, so this is a cap for slicing rather than a request.
MAX_RESULTS = 20

# source_type per domain (brief section 9 / SOURCE_QUALITY in scoring_config).
# Substring match against the result's domain; falls through to "unknown".
#
# These lists were rebuilt from the domains you.com ACTUALLY returns, measured
# across three real companies (Inseego / Premier Coil / Diamond Vogel), not
# carried over from Tavily. That mattered: inheriting Tavily's list left the
# classification inverted - genuine reporting (seekingalpha, fool.com, cnn,
# and trade press like coatingsworld/pcimag) fell through to "unknown" at 0.50
# while ZoomInfo and Crunchbase profile pages were correctly caught as
# "aggregator" at 0.60. Real journalism scored BELOW a scraped directory entry.
#
# The long tail still lands on "unknown" (0.50), which is the deliberately
# conservative default - an unrecognised domain should score low, not be
# guessed upward.
_SOURCE_TYPE_RULES = [
    ("official", (".gov", "sam.gov", "ted.europa.eu", "procurement")),
    # Primary financial/business reporting and equity analysis.
    ("reputable_independent", ("reuters.com", "bloomberg.com", "wsj.com", "ft.com", "forbes.com", "techcrunch.com",
                               "seekingalpha.com", "fool.com", "marketbeat.com", "cnn.com", "wtop.com",
                               "barrons.com", "cnbc.com")),
    # Trade press + regional business/daily papers. Real primary reporting, but
    # narrower reach than the national outlets above, so 0.80 not 0.90.
    ("industry_publication", ("fiercehealthcare", "mobihealthnews", "manufacturing", "industryweek", "healthcare",
                              "fierce-network", "lightreading", "rcrwireless", "thefastmode",
                              "coatingsworld.com", "pcimag.com", "specialchem.com",
                              "siouxcityjournal.com", "nwestiowa.com", "lmtonline.com", "thegazette.com",
                              "businessrecord.com")),
    # B2B data vendors, directories and republishers - no original reporting.
    ("aggregator", ("tracxn.com", "crunchbase.com", "linkedin.com", "wikipedia.org", "msn.com",
                    "zoominfo.com", "pitchbook.com", "cbinsights.com", "leadiq.com", "explorium.ai",
                    "quiverquant.com", "stocktitan.net", "moomoo.com",
                    "dnb.com", "growjo.com", "indeed.com", "inc.com", "yahoo.com")),
    ("company_press", ("businesswire.com", "prnewswire.com", "newswire.com", "globenewswire.com")),
]


class YouError(Exception):
    pass


class YouNotConfiguredError(YouError):
    pass


def is_configured() -> bool:
    return bool(get_settings().you_api_key)


def _headers() -> dict:
    settings = get_settings()
    if not settings.you_api_key:
        raise YouNotConfiguredError("YOU_API_KEY is not set in the environment")
    return {"X-API-Key": settings.you_api_key}


def build_query(
    domain: str | None, company_name: str | None = None, location: str | None = None
) -> str:
    """Deliberately short. Tavily needed a dense buying-signal keyword list
    stuffed into one query because it had no news channel; you.com has a
    `news` bucket, and live probes showed the keyword-stuffed query actively
    BREAKS it - the long form returned a single result about an unrelated
    company (an AAON earnings report), while a bare "Inseego news" returned
    ten real, dated Inseego items including its Q2 2026 earnings call. Short
    query, better recall.

    The company NAME is the anchor, not the domain - which is why a company
    with no website is still perfectly researchable. `location` is appended
    only when there is no domain to disambiguate with, since a bare generic
    name ("Apex", "Summit Partners") otherwise pulls in the wrong company."""
    subject = company_name or domain
    if not subject:
        return ""
    if location and not domain:
        return f"{subject} {location} news"
    return f"{subject} news"


def _clean(text: str | None) -> str:
    return (text or "").strip()


def _snippet_of(item: dict) -> str:
    """One text blob per result. web items carry `description` plus a
    `snippets` list; news items carry `description` only. Joined so the
    extraction LLM sees everything available for that URL."""
    parts = [_clean(item.get("description"))]
    snippets = item.get("snippets")
    if isinstance(snippets, list):
        parts.extend(_clean(s) for s in snippets)
    return "\n".join(p for p in parts if p)


async def search_query(query: str, num: int = MAX_RESULTS) -> list[dict]:
    """Runs an arbitrary query and returns results in the pipeline's shape.

    Split out of search() so callers with their own query needs - company
    enrichment resolving a name to a website, for instance - reuse this
    transport (auth, bucket merge, page_age -> date) instead of duplicating
    the HTTP call and drifting from it."""
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.get(SEARCH_URL, params={"query": query}, headers=_headers())
    if response.status_code != 200:
        raise YouError(f"you.com search failed ({response.status_code}): {response.text}")

    buckets = response.json().get("results") or {}
    merged: list[dict] = []
    for bucket in ("news", "web"):
        items = buckets.get(bucket)
        if isinstance(items, list):
            merged.extend(items)
    return [
        {
            "link": item.get("url"),
            "title": item.get("title"),
            "snippet": _snippet_of(item),
            "date": item.get("page_age"),
            "position": i,
        }
        for i, item in enumerate(merged[:num])
    ]


async def search(
    domain: str | None,
    company_name: str | None = None,
    num: int = MAX_RESULTS,
    location: str | None = None,
) -> list[dict]:
    """The single research call for one company. Merges the `news` and `web`
    buckets into one list shaped like { link, title, snippet, date, position } -
    the same shape the rest of the pipeline (is_relevant / to_evidence)
    expects, so nothing downstream knows which provider produced it.

    News comes first: those results are both genuinely news and the ones that
    actually carry `page_age`, so they lead the chunk the LLM reads.
    """
    query = build_query(domain, company_name, location)
    print(f"[YOU] >>> Calling you.com Search for '{company_name}' ({domain or 'no domain'})")
    print(f"[YOU]     query: {query!r}")
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.get(SEARCH_URL, params={"query": query}, headers=_headers())
    if response.status_code != 200:
        print(f"[YOU] <<< FAILED ({response.status_code}) for '{company_name}': {response.text[:200]}")
        raise YouError(f"you.com search failed ({response.status_code}): {response.text}")

    buckets = response.json().get("results") or {}
    merged: list[dict] = []
    for bucket in ("news", "web"):
        items = buckets.get(bucket)
        if isinstance(items, list):
            merged.extend(items)

    results = [
        {
            "link": item.get("url"),
            "title": item.get("title"),
            "snippet": _snippet_of(item),
            # page_age is an ISO timestamp when present. Absent stays None so
            # the extraction step can report an unknown date honestly rather
            # than defaulting to today (see module docstring).
            "date": item.get("page_age"),
            "position": i,
        }
        for i, item in enumerate(merged[:num])
    ]

    dated = sum(1 for r in results if r["date"])
    print(f"[YOU] <<< Got {len(results)} results for '{company_name}' "
          f"({len(buckets.get('news') or [])} news / {len(buckets.get('web') or [])} web, "
          f"{dated} dated)")
    for i, r in enumerate(results[:5]):
        print(f"[YOU]     [{i}] {r.get('title')!r} -> {r.get('link')}")
    if len(results) > 5:
        print(f"[YOU]     ... and {len(results) - 5} more")
    return results


_DOMAIN_LABEL_RE = re.compile(r"[^a-z0-9]+")


def _domain_label(domain: str | None) -> str:
    """The registrable-name portion of a domain, lowercased and stripped of
    punctuation, for relevance matching - "provenir.com" -> "provenir",
    "21stcenturyvitamins.com" -> "21stcenturyvitamins".

    Returns "" for a missing domain: a company with no website is still
    researched by name, and every caller already falls back to the company-name
    match when the label is empty."""
    if not domain:
        return ""
    host = str(domain).lower().split("/")[0]
    parts = host.split(".")
    label = parts[-2] if len(parts) >= 2 else parts[0]
    return _DOMAIN_LABEL_RE.sub("", label)


def is_relevant(domain: str, company_name: str | None, item: dict) -> bool:
    """Whether a result is actually about this company rather than a same-name
    collision or - specific to you.com - a trending-news fallback. True only if
    the domain's label or the company name appears in the result's
    title/snippet/link.

    This is the guard that makes you.com's news bucket safe to use: for a
    company with no real coverage it returns confidently-dated celebrity and
    sport articles, none of which mention the company, so all of them fail
    here. Removing this check would inject them as scored evidence."""
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
    """Normalises one you.com result into the evidence record the buying_event
    layer stores (brief section 9): every field needed to audit, dedup, and
    score the source later.

    source_type: a result on the COMPANY'S OWN domain is 'company_press',
    never 'unknown' (brief item 16) - detected purely via domain match since a
    single unified query no longer distinguishes "news" vs "site" results."""
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
