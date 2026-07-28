"""XSparks Offering Profile - the structured description of what XSparks
sells, used by the scoring pipeline to judge whether a company's buying
signal is commercially relevant (brief sections 5, 6).

Crucially, the Offering Profile NEVER excludes a company - it only informs the
LLM's relevance judgement (xsparks_relevance, best_offering). Every uploaded
company is still scored regardless.

sync flow: scrape xsparks.ai via the Nexus scraper -> ask the LLM for
structured JSON -> validate -> store on Organisation. If scraping or the LLM
is unavailable, fall back to XSPARKS_FALLBACK_PROFILE and record an honest
status ('fallback'/'sync_failed') rather than pretending fallback content was
freshly scraped.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Organisation
from app.services import llm_client, nexus_scraper

XSPARKS_SOURCE_URL = "https://xsparks.ai/"
OFFERING_PROFILE_VERSION = 1

# Statuses (brief section 6). Honest about provenance:
#   synced       - freshly scraped + LLM-structured from xsparks.ai
#   sync_failed  - a sync was attempted and failed; fallback is in place
#   fallback     - fallback profile in place, no successful sync yet
#   stale        - previously synced but past the refresh window
STATUS_SYNCED = "synced"
STATUS_SYNC_FAILED = "sync_failed"
STATUS_FALLBACK = "fallback"
STATUS_STALE = "stale"

# The seven XSparks offering areas (brief section 5), fleshed out so the LLM
# relevance step has real anchors even when a live sync hasn't run. Alternative
# solutions are solution *categories*, not invented named competitors, and are
# marked inferred.
XSPARKS_FALLBACK_PROFILE = {
    "company": "XSparks",
    "source_url": XSPARKS_SOURCE_URL,
    "positioning": "AI solutions and AI transformation partner",
    "offerings": [
        {
            "name": "AI Strategy and Readiness",
            "problems_solved": ["unclear AI strategy", "no prioritised use cases", "AI readiness gaps"],
            "technologies": ["AI roadmapping", "use-case discovery", "readiness assessment"],
            "buying_signals": ["new CAIO/CDO", "AI transformation program", "AI budget announced"],
        },
        {
            "name": "Data Foundations and AI-Ready Architecture",
            "problems_solved": ["fragmented data", "poor data quality", "no AI-ready data platform"],
            "technologies": ["data platform", "data preparation", "cloud data architecture"],
            "buying_signals": ["data platform initiative", "cloud migration", "data modernisation"],
        },
        {
            "name": "AI Agents and Workflow Automation",
            "problems_solved": ["manual workflows", "slow operations", "repetitive knowledge work"],
            "technologies": ["AI agents", "copilots", "intelligent workflow automation"],
            "buying_signals": ["automation program", "AI tool adoption", "operational inefficiency"],
        },
        {
            "name": "Agent Orchestration and Enterprise Integration",
            "problems_solved": ["siloed systems", "brittle integrations", "no orchestration layer"],
            "technologies": ["agent orchestration", "MCP", "API integration", "ERP/MES integration"],
            "buying_signals": ["ERP integration", "MES integration", "system consolidation"],
        },
        {
            "name": "Legacy Modernisation and AI-Powered Automation",
            "problems_solved": ["legacy processes", "aging systems", "high manual overhead"],
            "technologies": ["process modernisation", "AI automation", "RPA replacement"],
            "buying_signals": ["legacy modernisation", "vendor replacement", "RPA dissatisfaction"],
        },
        {
            "name": "AI Governance and Responsible AI",
            "problems_solved": ["AI risk", "compliance burden", "no human-in-the-loop controls"],
            "technologies": ["AI governance", "security", "human-in-the-loop", "responsible AI"],
            "buying_signals": ["regulatory pressure", "compliance problems", "AI governance mandate"],
        },
        {
            "name": "Managed AI Operations and Accelerators",
            "problems_solved": ["no AI ops capacity", "slow time-to-value", "point problems needing accelerators"],
            "technologies": ["managed AI operations", "Technician AI Twin", "CallReady", "AI Configuration Agent"],
            "buying_signals": ["predictive maintenance", "quality inspection", "technician knowledge gaps"],
        },
    ],
    "problems_solved": [
        "unclear AI strategy", "fragmented data", "manual and slow workflows",
        "siloed enterprise systems", "legacy processes", "AI risk and compliance",
        "operational inefficiency", "quality-control problems", "supply-chain optimisation",
    ],
    "relevant_technologies": [
        "AI agents", "copilots", "workflow automation", "data platform",
        "agent orchestration", "MCP", "API integration", "computer vision",
        "predictive maintenance", "responsible AI",
    ],
    "alternative_solutions": [
        {"category": "Internal AI development", "inferred": True},
        {"category": "Traditional system integrators", "inferred": True},
        {"category": "Legacy RPA", "inferred": True},
        {"category": "Generic AI copilots", "inferred": True},
        {"category": "Point automation tools", "inferred": True},
        {"category": "Existing software vendor AI modules", "inferred": True},
    ],
    "accelerators": ["Technician AI Twin", "CallReady", "AI Configuration Agent"],
    "synced_at": None,
    "version": OFFERING_PROFILE_VERSION,
}

_REQUIRED_KEYS = {"company", "positioning", "offerings", "problems_solved", "relevant_technologies"}


def fallback_profile() -> dict:
    """A deep copy of the fallback profile with a fresh source_url set."""
    profile = json.loads(json.dumps(XSPARKS_FALLBACK_PROFILE))
    profile["source_url"] = XSPARKS_SOURCE_URL
    return profile


def profile_for_scoring(org: Organisation | None) -> dict:
    """The profile the scoring pipeline should use - the org's stored one if
    present, else the fallback. Guarantees relevance scoring always has a
    profile, so a company is never left unscored for lack of one."""
    if org is not None and org.offering_profile:
        return org.offering_profile
    return fallback_profile()


def _build_extraction_prompt(scraped_text: str) -> str:
    template = json.dumps(
        {
            "company": "XSparks",
            "positioning": "",
            "offerings": [{"name": "", "problems_solved": [], "technologies": [], "buying_signals": []}],
            "problems_solved": [],
            "relevant_technologies": [],
            "alternative_solutions": [{"category": "", "inferred": True}],
            "accelerators": [],
        },
        indent=2,
    )
    return (
        "You are analysing the website of XSparks, an AI solutions and AI transformation "
        "partner. From the scraped page content below, produce a structured JSON profile of "
        "what XSparks SELLS - the offerings, the problems each solves, the relevant "
        "technologies, and the categories of alternative solutions a buyer might consider.\n\n"
        "Rules:\n"
        "- alternative_solutions must be solution CATEGORIES (e.g. 'Internal AI development', "
        "'Legacy RPA'), never invented named competitors. Mark each with inferred:true unless "
        "the page explicitly names it.\n"
        "- Do not invent offerings not supported by the content.\n"
        "- buying_signals should describe the kind of company event that would indicate a need "
        "for that offering.\n\n"
        f"Respond with ONLY this JSON shape, no prose or markdown:\n{template}\n\n"
        f"Scraped content:\n{scraped_text[:12000]}"
    )


def _parse_profile(raw: str) -> dict | None:
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or not _REQUIRED_KEYS.issubset(parsed.keys()):
        return None
    if not isinstance(parsed.get("offerings"), list) or not parsed["offerings"]:
        return None
    return parsed


async def _scrape_and_extract(organisation_id=None) -> dict | None:
    """Returns a freshly-scraped + LLM-structured profile, or None if either
    the scraper or the LLM is unavailable / returns unusable output."""
    if not nexus_scraper.is_configured() or not llm_client.is_configured():
        return None
    try:
        content = await nexus_scraper.scrape(XSPARKS_SOURCE_URL, output_format="markdown")
    except Exception:
        return None
    if not content:
        return None
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _build_extraction_prompt(content)}],
            generation_name="sync-offering-profile",
            trace_user_id=str(organisation_id) if organisation_id else None,
        )
    except Exception:
        return None
    return _parse_profile(raw)


async def sync_offering_profile(session: AsyncSession, organisation_id) -> dict:
    """Sync XSparks' Offering Profile onto the organisation. Never raises for
    a scraping/LLM failure - it stores the fallback with an honest status
    instead, so onboarding is never blocked by xsparks.ai being unavailable
    (brief section 6). Returns {status, profile}."""
    now = datetime.now(timezone.utc)
    extracted = await _scrape_and_extract(organisation_id)

    if extracted is not None:
        extracted["source_url"] = XSPARKS_SOURCE_URL
        extracted["synced_at"] = now.isoformat()
        extracted["version"] = OFFERING_PROFILE_VERSION
        profile, status = extracted, STATUS_SYNCED
    else:
        profile = fallback_profile()
        # sync_failed if the org previously had a real profile or we actively
        # tried and failed; plain fallback if this is a first-time seed.
        status = STATUS_SYNC_FAILED

    await session.execute(
        update(Organisation)
        .where(Organisation.organisation_id == organisation_id)
        .values(
            offering_profile=profile,
            offering_profile_source_url=XSPARKS_SOURCE_URL,
            offering_profile_status=status,
            offering_profile_synced_at=now if status == STATUS_SYNCED else None,
        )
    )
    await session.commit()
    return {"status": status, "profile": profile}


OFFERING_PROFILE_STALE_DAYS = 30


def _is_stale(org: Organisation, now: datetime) -> bool:
    if org.offering_profile_status != STATUS_SYNCED or org.offering_profile_synced_at is None:
        return True
    synced = org.offering_profile_synced_at
    if synced.tzinfo is None:
        synced = synced.replace(tzinfo=timezone.utc)
    return (now - synced).days > OFFERING_PROFILE_STALE_DAYS


async def ensure_offering_profile(session: AsyncSession, organisation_id) -> dict:
    """Guarantee a usable Offering Profile before a scoring run (brief item 11).
    Attempts a LIVE xsparks.ai sync when the org has no synced profile or its
    profile is stale; only falls back to the canned profile if that live sync
    fails. Does not re-scrape a fresh, already-synced profile."""
    org = await session.get(Organisation, organisation_id)
    now = datetime.now(timezone.utc)

    # A fresh, real profile is reused as-is (no needless re-scrape).
    if org is not None and org.offering_profile and not _is_stale(org, now):
        return org.offering_profile

    # Missing or stale -> try a live sync (scrape + LLM), fall back if it fails.
    result = await sync_offering_profile(session, organisation_id)
    if result["status"] == STATUS_SYNCED:
        return result["profile"]

    # Live sync failed. Keep any existing profile; otherwise seed the fallback
    # and mark the status honestly.
    if org is not None and org.offering_profile:
        return org.offering_profile
    profile = fallback_profile()
    await session.execute(
        update(Organisation)
        .where(Organisation.organisation_id == organisation_id)
        .values(
            offering_profile=profile,
            offering_profile_source_url=XSPARKS_SOURCE_URL,
            offering_profile_status=STATUS_FALLBACK,
        )
    )
    await session.commit()
    return profile
