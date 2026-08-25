"""Fills missing company fields from you.com during / after research.

Two enrichment jobs share this module:

  1. Domain resolution - conservative website fill for sheets with no Website
     column. A WRONG domain is worse than a missing one (it points buying-
     evidence research at a different company), so acceptance is strict.
     Currently optional in the upload pipeline (see excel_pipeline).

  2. Firmographics - Industry, employees, revenue, founded year, ownership,
     headquarters, and funding for the Enterprise Detail cards. Spreadsheet
     ingest only writes these when the file carries the columns; research used
     to gather buying events and scores while leaving those cards as "—".
     One dedicated you.com search + LLM extract fills ONLY columns that are
     still NULL, never overwriting spreadsheet values.

Precision over coverage for domains
-----------------------------------
  * Aggregators, social networks and news sites can never be the answer.
  * The candidate's domain label must correspond to the company name.
  * Anything below the confidence floor is left NULL and reported, not guessed.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.industry_sectors import SECTOR_INDUSTRIES
from app.models import Company
from app.services import llm_client, you_client
from app.services.table_mapper import normalize_company_name
from app.services.zoominfo_mapper import COUNTRY_CONTINENT, OWNERSHIP_MAP

logger = logging.getLogger(__name__)

# Concurrent enrichment lookups. Matches the research stage's default so one
# upload cannot open more upstream connections than the rest of the pipeline.
MAX_CONCURRENCY = 10

# Never a company's own website, however highly it ranks. Directory and social
# results dominate the first page for small private companies, which is exactly
# the population that needs enriching.
NEVER_COMPANY_DOMAINS = {
    "linkedin.com", "crunchbase.com", "zoominfo.com", "pitchbook.com", "cbinsights.com",
    "leadiq.com", "explorium.ai", "dnb.com", "growjo.com", "apollo.io", "rocketreach.co",
    "owler.com", "glassdoor.com", "indeed.com", "wikipedia.org", "bloomberg.com",
    "reuters.com", "forbes.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "medium.com", "github.com", "yahoo.com", "msn.com", "tracxn.com",
    "similarweb.com", "trustpilot.com", "g2.com", "capterra.com", "clutch.co",
    "signalhire.com", "lusha.com", "endole.co.uk", "opencorporates.com", "bizapedia.com",
}

# Confidence floor for writing a domain. Below this the value is discarded.
MIN_DOMAIN_CONFIDENCE = 0.75

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _domain_label(domain: str) -> str:
    parts = domain.lower().split(".")
    return _NON_ALNUM.sub("", parts[-2] if len(parts) >= 2 else parts[0])


def _registrable(host: str | None) -> str | None:
    """Strips scheme, www and path, and drops obvious subdomains so
    "careers.acme.com" and "www.acme.com" both resolve to "acme.com"."""
    if not host:
        return None
    host = re.sub(r"^https?://", "", str(host).strip().lower())
    host = host.split("/")[0].split("?")[0]
    host = re.sub(r"^www\.", "", host)
    if not host or "." not in host:
        return None
    parts = host.split(".")
    # Keep the last three labels for known two-part public suffixes (co.uk,
    # com.au), otherwise the last two.
    if len(parts) >= 3 and parts[-2] in ("co", "com", "org", "net", "gov", "ac"):
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_excluded(domain: str) -> bool:
    return any(domain == bad or domain.endswith("." + bad) for bad in NEVER_COMPANY_DOMAINS)


# A first word must be at least this long to be treated as distinctive enough
# to anchor an abbreviation match. Short words ("apex", "core", "one") collide
# across unrelated companies far too easily.
MIN_ANCHOR_TOKEN_LENGTH = 5


def _is_abbreviated_descriptor(company_name: str, label: str) -> bool:
    """True when the label is the company's first word plus an abbreviation of
    the rest - "Luminar Technologies" -> "luminartech".

    Requires BOTH halves to correspond. Sharing only the first word is not
    enough: "Summit Partners" and summitventures.com share "summit" but their
    remainders are unrelated, and treating that as a match would attach another
    company's news to a real prospect."""
    tokens = normalize_company_name(company_name).split()
    if len(tokens) < 2:
        return False
    first, rest = tokens[0], "".join(tokens[1:])
    if len(first) < MIN_ANCHOR_TOKEN_LENGTH or not label.startswith(first):
        return False
    remainder = label[len(first):]
    if not remainder:
        return False
    # The label's remainder must abbreviate the name's remainder, or vice
    # versa - "tech" for "technologies", "sol" for "solutions".
    return rest.startswith(remainder) or remainder.startswith(rest)


def score_domain_candidate(company_name: str, domain: str, rank: int) -> float:
    """0-1 confidence that `domain` is `company_name`'s own website.

    Built from the name<->label relationship rather than search rank alone,
    because rank mostly reflects a site's authority: a directory listing for a
    50-person company outranks the company itself."""
    label = _domain_label(domain)
    if not label:
        return 0.0
    name_key = _NON_ALNUM.sub("", normalize_company_name(company_name))
    if not name_key:
        return 0.0

    shorter, longer = sorted((label, name_key), key=len)
    coverage = len(shorter) / len(longer)        # how much of the name the label accounts for

    if label == name_key:
        score = 1.0                              # tacnode <-> tacnode.io
    elif _is_abbreviated_descriptor(company_name, label):
        # "Luminar Technologies" -> luminartech.com. Same distinctive first
        # word, and the label's remainder abbreviates the name's remainder
        # ("tech" for "technologies"). Coverage alone rejects this at 0.58,
        # but it is a real match.
        #
        # The remainder check is what keeps this safe: "Summit Partners" vs
        # summitventures.com also shares a first word, but "ventures" does not
        # abbreviate "partners", so it is still refused.
        score = 0.85
    elif name_key.startswith(label) or label.startswith(name_key):
        # A shared PREFIX is the strong signal: companies lead with their
        # distinguishing word, so "acmehealth" vs "acme" is usually the same
        # company shortened. Still requires most of the name to be accounted
        # for, or "acme" would match "acmecorporationofamerica".
        score = 0.85 if coverage >= 0.7 else 0.60
    elif name_key in label or label in name_key:
        # Containment WITHOUT a shared prefix is much weaker - it means the
        # label drops the distinguishing part. Real case: "Premier Coil
        # Solutions" vs coilsolutions.com, which shares two of three words and
        # is a different company (the true domain is premiercoil.com). Only
        # accepted when almost the whole name is covered.
        score = 0.82 if coverage >= 0.8 else 0.55
    else:
        return 0.0                               # no relationship - never guess

    # Rank is a mild tiebreak only. Capped small on purpose: it must never move
    # a candidate across MIN_DOMAIN_CONFIDENCE by itself, or the same domain
    # would be accepted or refused purely on where it happened to rank.
    return max(0.0, score - min(rank, 5) * 0.01)


def resolve_domain(company_name: str, results: list[dict]) -> tuple[str | None, float, str]:
    """Best (domain, confidence, reason) for a company, or (None, 0, reason).

    Returns the reason either way so a skipped company can be explained rather
    than just being absent."""
    best_domain, best_score = None, 0.0
    excluded = 0
    for item in results:
        domain = _registrable(item.get("link"))
        if not domain:
            continue
        if _is_excluded(domain):
            excluded += 1
            continue
        score = score_domain_candidate(company_name, domain, item.get("position", 0))
        if score > best_score:
            best_domain, best_score = domain, score

    if best_domain is None:
        return None, 0.0, (
            f"no candidate matched the company name ({excluded} directory/social result(s) excluded)"
        )
    if best_score < MIN_DOMAIN_CONFIDENCE:
        return None, best_score, (
            f"best candidate {best_domain!r} scored {best_score:.2f}, below the "
            f"{MIN_DOMAIN_CONFIDENCE} floor - left unset rather than guessed"
        )
    return best_domain, best_score, f"matched {best_domain!r} at confidence {best_score:.2f}"


def _build_query(company_name: str, city: str | None, country: str | None) -> str:
    """Location narrows a generic name ("Summit Partners", "Apex") onto the
    right company when the sheet supplies it."""
    parts = [company_name, "official website"]
    if city:
        parts.insert(1, city)
    elif country:
        parts.insert(1, country)
    return " ".join(parts)


async def enrich_company(company: Company) -> dict:
    """Resolves one company's missing domain. Returns a result record; never
    raises, so one bad lookup cannot abort a batch."""
    result = {
        "company_id": company.company_id,
        "company_name": company.company_name,
        "domain": None,
        "confidence": 0.0,
        "reason": "",
        "failed": False,
    }
    query = _build_query(company.company_name, company.city, company.country)
    try:
        results = await you_client.search_query(query)
    except Exception as exc:
        result["failed"] = True
        result["reason"] = f"search failed: {type(exc).__name__}: {exc}"
        return result

    domain, confidence, reason = resolve_domain(company.company_name, results)
    result.update(domain=domain, confidence=confidence, reason=reason)
    return result


async def enrich_missing_domains(
    session: AsyncSession, organisation_id, company_ids=None, limit: int | None = None,
) -> dict:
    """Fills company_domain for companies that have none, so the research stage
    stops skipping them.

    Scoped to company_ids when given (one upload's companies) - otherwise it
    would re-attempt every unresolvable company in the organisation on every
    upload, paying for the same failed searches repeatedly."""
    if not you_client.is_configured():
        return {"attempted": 0, "resolved": 0, "unresolved": 0, "failed": 0,
                "search_not_configured": True, "details": []}

    stmt = select(Company).where(
        Company.organisation_id == organisation_id,
        Company.company_domain.is_(None),
    )
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    if limit:
        stmt = stmt.limit(limit)
    companies = list((await session.execute(stmt)).scalars().all())

    if not companies:
        return {"attempted": 0, "resolved": 0, "unresolved": 0, "failed": 0, "details": []}

    logger.info("Enriching %d company(ies) with no domain", len(companies))
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def run(company: Company) -> dict:
        async with semaphore:
            return await enrich_company(company)

    results = await asyncio.gather(*[run(c) for c in companies])

    resolved = [r for r in results if r["domain"]]
    for record in resolved:
        await session.execute(
            update(Company)
            .where(Company.company_id == record["company_id"])
            .values(company_domain=record["domain"])
        )
    if resolved:
        await session.commit()

    failed = sum(1 for r in results if r["failed"])
    return {
        "attempted": len(results),
        "resolved": len(resolved),
        "unresolved": len(results) - len(resolved) - failed,
        "failed": failed,
        "details": results,
    }


# ---------------------------------------------------------------------------
# Firmographics (Industry / HQ / revenue / funding / …)
# ---------------------------------------------------------------------------

# ZoomInfo primary-industry labels the sector rollup already knows. The LLM is
# asked to prefer one of these so Dashboard / Signal Feed industry filters keep
# working without a second mapping layer.
KNOWN_INDUSTRIES: tuple[str, ...] = tuple(
    industry for industries in SECTOR_INDUSTRIES.values() for industry in industries
)

# Free-form industry phrases the model (or a sheet) often returns -> closest
# ZoomInfo label. Matched case-insensitively after stripping.
_INDUSTRY_ALIASES: dict[str, str] = {
    "financial services": "Finance",
    "banking": "Finance",
    "fintech": "Finance",
    "payments": "Finance",
    "credit cards": "Finance",
    "technology": "Software",
    "information technology": "Software",
    "it": "Software",
    "saas": "Software",
    "software & internet": "Software",
    "internet": "Media & Internet",
    "media": "Media & Internet",
    "telecom": "Telecommunications",
    "telecoms": "Telecommunications",
    "healthcare": "Healthcare Services",
    "health care": "Healthcare Services",
    "hospitals": "Hospitals & Physicians Clinics",
    "manufacturing & industrial": "Manufacturing",
    "industrial": "Manufacturing",
    "oil & gas": "Energy, Utilities & Waste",
    "energy": "Energy, Utilities & Waste",
    "utilities": "Energy, Utilities & Waste",
    "mining": "Minerals & Mining",
    "real estate & construction": "Real Estate",
    "consumer goods": "Retail",
    "cpg": "Retail",
    "e-commerce": "Retail",
    "ecommerce": "Retail",
    "hospitality & leisure": "Hospitality",
    "travel": "Hospitality",
    "education & training": "Education",
    "professional services": "Business Services",
    "consulting": "Business Services",
    "logistics": "Transportation",
    "shipping": "Transportation",
}

_MONEY_RE = re.compile(
    r"^\s*\$?\s*([\d]+(?:\.\d+)?)\s*(thousand|k|million|m|billion|b|trillion|t)?\s*$",
    re.I,
)


def needs_firmographic_enrichment(company: Company) -> bool:
    """True when Enterprise Detail would still show "—" for a firmographic row."""
    if not (company.primary_industry or company.industries):
        return True
    if company.employee_count is None and not company.employee_range:
        return True
    if company.revenue_usd is None and not company.revenue_range:
        return True
    if not company.founded_year:
        return True
    if not company.ownership_type:
        return True
    if not company.city and not company.country:
        return True
    if (
        company.total_funding_amount is None
        and company.recent_funding_amount is None
        and company.recent_funding_date is None
    ):
        # Public/large companies often have no "funding rounds" - only chase
        # funding when other firmographics are also thin, otherwise every
        # public company pays for a useless second search forever.
        return False
    return False


def normalize_industry_label(raw: str | None) -> str | None:
    """Map free-form industry text onto a known ZoomInfo primary_industry label."""
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    lower = text.lower()
    for known in KNOWN_INDUSTRIES:
        if known.lower() == lower:
            return known
    if lower in _INDUSTRY_ALIASES:
        return _INDUSTRY_ALIASES[lower]
    for alias, known in _INDUSTRY_ALIASES.items():
        if alias in lower or lower in alias:
            return known
    # Keep the model's wording when nothing maps - better than blank, and
    # sector_for() will park it under Unclassified rather than inventing a bucket.
    return text


def parse_usd_amount(value) -> int | None:
    """USD integer from an LLM number or a short phrase like '$56B' / '2.3 million'."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    if not isinstance(value, str):
        return None
    text = value.strip().lower().replace(",", "").replace("usd", "").replace("us$", "")
    if not text:
        return None
    match = _MONEY_RE.match(text)
    if not match:
        try:
            n = float(re.sub(r"[^\d.]", "", text))
            return int(n) if n > 0 else None
        except ValueError:
            return None
    amount = float(match.group(1))
    unit = (match.group(2) or "").lower()
    mult = {
        "": 1,
        "k": 1_000,
        "thousand": 1_000,
        "m": 1_000_000,
        "million": 1_000_000,
        "b": 1_000_000_000,
        "billion": 1_000_000_000,
        "t": 1_000_000_000_000,
        "trillion": 1_000_000_000_000,
    }.get(unit, 1)
    total = int(amount * mult)
    return total if total > 0 else None


def _build_firmographic_query(company: Company) -> str:
    parts = [company.company_name, "company industry headquarters employees revenue founded ownership funding"]
    if company.company_domain:
        parts.insert(1, company.company_domain)
    elif company.city:
        parts.insert(1, company.city)
    elif company.country:
        parts.insert(1, company.country)
    return " ".join(parts)


def _snippet_block(results: list[dict], limit: int = 8) -> str:
    lines = []
    for i, item in enumerate(results[:limit]):
        title = (item.get("title") or "").strip()
        snippet = (item.get("snippet") or "").strip()
        link = (item.get("link") or "").strip()
        if not (title or snippet):
            continue
        lines.append(f"[{i}] {title}\nURL: {link}\n{snippet}")
    return "\n\n".join(lines)


def _firmographic_prompt(company: Company, results: list[dict]) -> str:
    known = ", ".join(KNOWN_INDUSTRIES)
    return (
        f"Extract firmographic facts about the company {company.company_name!r} "
        f"(domain={company.company_domain or 'unknown'}) from the search snippets below.\n"
        "Return ONLY a JSON object with these keys (use null when not stated):\n"
        "  primary_industry, industries, employee_count, employee_range,\n"
        "  revenue_usd, revenue_range, founded_year, ownership_type,\n"
        "  city, state, country, total_funding_usd, recent_funding_usd, recent_funding_date\n"
        f"primary_industry MUST be one of: {known}\n"
        "industries is an array of short industry labels (may include primary_industry).\n"
        "ownership_type must be one of: public, private, pe_backed (or null).\n"
        "employee_count / revenue_usd / funding amounts are plain USD integers (not thousands).\n"
        "recent_funding_date is ISO date YYYY-MM-DD when known.\n"
        "Do not invent numbers - only use values the snippets support.\n\n"
        f"SNIPPETS:\n{_snippet_block(results)}"
    )


def _parse_firmographic_json(raw: str) -> dict:
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _parse_funding_date(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()[:10]
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y"):
        try:
            dt = datetime.strptime(text if fmt != "%Y" else text[:4], fmt)
            if fmt == "%Y":
                dt = dt.replace(month=1, day=1)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def firmographic_updates(company: Company, extracted: dict) -> dict:
    """Columns to write - only fields that are currently NULL on the company."""
    updates: dict = {}
    if not (company.primary_industry or company.industries):
        primary = normalize_industry_label(extracted.get("primary_industry"))
        industries_raw = extracted.get("industries")
        industries: list[str] = []
        if isinstance(industries_raw, list):
            for item in industries_raw:
                label = normalize_industry_label(item if isinstance(item, str) else None)
                if label and label not in industries:
                    industries.append(label)
        elif isinstance(industries_raw, str):
            label = normalize_industry_label(industries_raw)
            if label:
                industries.append(label)
        if primary and primary not in industries:
            industries.insert(0, primary)
        if primary:
            updates["primary_industry"] = [primary]
        if industries:
            updates["industries"] = industries

    if company.employee_count is None:
        count = extracted.get("employee_count")
        if isinstance(count, bool):
            count = None
        if isinstance(count, (int, float)) and count > 0:
            updates["employee_count"] = int(count)
        elif isinstance(count, str):
            parsed = parse_usd_amount(count)  # same number parser for "10,000+"
            if parsed:
                updates["employee_count"] = parsed
    if not company.employee_range:
        er = extracted.get("employee_range")
        if isinstance(er, str) and er.strip():
            updates["employee_range"] = er.strip()[:50]

    if company.revenue_usd is None:
        rev = parse_usd_amount(extracted.get("revenue_usd"))
        if rev is None and isinstance(extracted.get("revenue_range"), str):
            rev = parse_usd_amount(extracted["revenue_range"])
        if rev:
            updates["revenue_usd"] = rev
    if not company.revenue_range:
        rr = extracted.get("revenue_range")
        if isinstance(rr, str) and rr.strip():
            updates["revenue_range"] = rr.strip()[:50]

    if not company.founded_year:
        year = extracted.get("founded_year")
        if isinstance(year, int) and 1400 <= year <= 2100:
            updates["founded_year"] = str(year)
        elif isinstance(year, str):
            digits = re.search(r"(1[5-9]\d{2}|20\d{2})", year)
            if digits:
                updates["founded_year"] = digits.group(1)

    if not company.ownership_type:
        ownership = extracted.get("ownership_type")
        if isinstance(ownership, str):
            mapped = OWNERSHIP_MAP.get(ownership.strip().lower())
            if mapped:
                updates["ownership_type"] = mapped

    if not company.city:
        city = extracted.get("city")
        if isinstance(city, str) and city.strip():
            updates["city"] = city.strip()[:100]
    if not company.state:
        state = extracted.get("state")
        if isinstance(state, str) and state.strip():
            updates["state"] = state.strip()[:100]
    if not company.country:
        country = extracted.get("country")
        if isinstance(country, str) and country.strip():
            updates["country"] = country.strip()[:100]
            updates["continent"] = COUNTRY_CONTINENT.get(country.strip().lower())

    if company.total_funding_amount is None:
        total = parse_usd_amount(extracted.get("total_funding_usd"))
        if total:
            updates["total_funding_amount"] = total
    if company.recent_funding_amount is None:
        recent = parse_usd_amount(extracted.get("recent_funding_usd"))
        if recent:
            updates["recent_funding_amount"] = recent
    if company.recent_funding_date is None:
        funded = _parse_funding_date(extracted.get("recent_funding_date"))
        if funded:
            updates["recent_funding_date"] = funded

    if updates.get("recent_funding_amount") or updates.get("total_funding_amount"):
        if company.company_funding is None:
            entry = {
                "date": (
                    updates["recent_funding_date"].date().isoformat()
                    if updates.get("recent_funding_date")
                    else None
                ),
                "amount": updates.get("recent_funding_amount") or updates.get("total_funding_amount"),
                "source": "you.com enrichment",
            }
            updates["company_funding"] = [entry]

    return updates


async def enrich_firmographics(company: Company) -> dict:
    """One company: you.com search + LLM extract. Never raises."""
    result = {
        "company_id": company.company_id,
        "company_name": company.company_name,
        "updated_fields": [],
        "reason": "",
        "failed": False,
    }
    if not needs_firmographic_enrichment(company):
        result["reason"] = "already complete"
        return result

    query = _build_firmographic_query(company)
    try:
        results = await you_client.search_query(query)
    except Exception as exc:
        result["failed"] = True
        result["reason"] = f"search failed: {type(exc).__name__}: {exc}"
        return result

    if not results:
        result["reason"] = "no search results"
        return result

    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _firmographic_prompt(company, results)}],
            generation_name="extract-firmographics",
            temperature=0,
            trace_user_id=str(company.organisation_id) if company.organisation_id else None,
        )
    except Exception as exc:
        result["failed"] = True
        result["reason"] = f"llm failed: {type(exc).__name__}: {exc}"
        return result

    extracted = _parse_firmographic_json(raw)
    if not extracted:
        result["reason"] = "unparseable llm response"
        result["failed"] = True
        return result

    updates = firmographic_updates(company, extracted)
    result["updated_fields"] = sorted(updates.keys())
    result["updates"] = updates
    result["reason"] = (
        f"filled {len(updates)} field(s)" if updates else "llm returned nothing new for empty columns"
    )
    return result


async def enrich_missing_firmographics(
    session: AsyncSession,
    organisation_id,
    company_ids=None,
    limit: int | None = None,
    processed_only: bool = False,
) -> dict:
    """Fills empty firmographic columns for companies in scope via you.com + LLM.

    Only NULL columns are written - spreadsheet values always win. Called from
    the upload pipeline after buying-event research and before scoring so
    Expected Deal Value can use a newly found revenue figure, and so Enterprise
    Detail is populated on the same pass that produces the Lead Score.

    processed_only=True restricts to companies that already have a Lead Score or
    a completed research stamp - the population the user sees as "processed" on
    Enterprise List / Detail, rather than every row ever ingested.
    """
    from app.models import LeadScore

    if not you_client.is_configured():
        return {
            "attempted": 0, "updated": 0, "unchanged": 0, "failed": 0,
            "search_not_configured": True, "details": [],
        }

    stmt = select(Company).where(Company.organisation_id == organisation_id)
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    if processed_only:
        stmt = stmt.outerjoin(LeadScore, LeadScore.company_id == Company.company_id).where(
            or_(
                Company.search_signals_fetched_at.isnot(None),
                LeadScore.lead_score_id.isnot(None),
            )
        )
    # Cheap SQL pre-filter: skip companies that already look complete enough
    # that needs_firmographic_enrichment would return False.
    stmt = stmt.where(
        or_(
            Company.primary_industry.is_(None),
            Company.industries.is_(None),
            Company.employee_count.is_(None),
            Company.employee_range.is_(None),
            Company.revenue_usd.is_(None),
            Company.revenue_range.is_(None),
            Company.founded_year.is_(None),
            Company.ownership_type.is_(None),
            Company.city.is_(None),
            Company.country.is_(None),
        )
    )
    if limit:
        stmt = stmt.limit(limit)
    companies = list((await session.execute(stmt)).scalars().unique().all())
    companies = [c for c in companies if needs_firmographic_enrichment(c)]

    if not companies:
        return {"attempted": 0, "updated": 0, "unchanged": 0, "failed": 0, "details": []}

    total = len(companies)
    logger.info("Enriching firmographics for %d company(ies)", total)
    print(f"[UPLOAD] Enriching firmographics for {total} company(ies) via you.com...")
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    # Commit in chunks so a long backfill of thousands of processed companies
    # does not hold every update until the end (and lose them if the process
    # dies mid-run). Chunk size matches concurrency so progress prints land
    # about once per wave.
    CHUNK = max(MAX_CONCURRENCY * 5, 50)
    updated = 0
    failed = 0
    unchanged = 0
    details: list[dict] = []

    for offset in range(0, total, CHUNK):
        chunk = companies[offset : offset + CHUNK]

        async def run(company: Company) -> dict:
            async with semaphore:
                return await enrich_firmographics(company)

        results = await asyncio.gather(*[run(c) for c in chunk])
        for record in results:
            updates = record.get("updates") or {}
            if updates:
                await session.execute(
                    update(Company)
                    .where(Company.company_id == record["company_id"])
                    .values(**updates)
                )
                updated += 1
            elif record.get("failed"):
                failed += 1
            else:
                unchanged += 1
            details.append({k: v for k, v in record.items() if k != "updates"})
        await session.commit()
        done = min(offset + len(chunk), total)
        print(f"[UPLOAD] Firmographics progress: {done}/{total} "
              f"(updated={updated} failed={failed} unchanged={unchanged})")

    print(f"[UPLOAD] Firmographics: updated={updated} failed={failed} unchanged={unchanged}")
    return {
        "attempted": total,
        "updated": updated,
        "unchanged": unchanged,
        "failed": failed,
        "details": details,
    }
