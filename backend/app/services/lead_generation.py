"""ICP-driven lead generation: turn an ICP into verified company rows.

The platform otherwise only ever *scores* companies someone already had. This
discovers new ones: an LLM proposes candidates matching an ICP, each candidate
is verified against live web search, and only the survivors become `company`
rows that the existing research + scoring pipeline then treats exactly like
uploaded ones.

    ICP -> LLM candidates -> web verification -> company rows -> (existing pipeline)

THE CENTRAL RISK IS HALLUCINATION. An LLM asked to name companies matching an
ICP will invent plausible ones, with plausible domains. Everything here treats
the model's output as a *search hypothesis*, never as data:

  * The prompt asks only for name + country + a domain guess. Deliberately NOT
    revenue, headcount or industry - those would be pure invention, and they
    are exactly what enrichment already derives from real sources.
  * No candidate is written to the database before an independent search
    resolves a real domain for it (company_enrichment.resolve_domain, which
    scores the domain against the company name and refuses to guess below a
    confidence floor).
  * A candidate whose domain cannot be resolved is dropped, with the reason
    recorded, rather than being stored as an unverified row.

The product's promise is that every claim traces to a source. A generated list
containing companies that do not exist would break that faster than any
missing feature would.

Identity: generated companies have no ZoomInfo id, so zi_company_id is derived
from the RESOLVED domain via table_mapper.synthetic_bigint - the same
mechanism plain-CSV uploads use. Hashing the resolved domain (never the LLM's
guess) is what makes re-running an ICP update the same rows instead of
creating twins.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, IcpProfile, Organisation
from app.services import (
    company_enrichment,
    llm_client,
    offering_profile_service,
    table_mapper,
    you_client,
    zoominfo_mapper,
)

logger = logging.getLogger(__name__)

# Candidates requested per LLM call. One call for hundreds of names truncates
# and degrades; several smaller calls stay coherent and fail independently.
CHUNK_SIZE = 25

# How many already-owned company names to echo into the prompt. Large enough to
# actually steer the model off its favourite answers, small enough that the
# exclusion list does not crowd out the instructions.
EXCLUDE_NAME_LIMIT = 200

# Hard cap on names echoed into a single prompt, covering this run's candidates
# plus the owned-name steer.
PROMPT_EXCLUDE_MAX = 300

# Verification is one search per candidate, so this is the real cost driver.
# Kept at/below the research stage's default concurrency to avoid being the
# thing that trips you.com's rate limit.
VERIFY_CONCURRENCY = 8

# Ask for more than the target, because verification legitimately rejects
# some. 1.5x is enough to absorb a normal rejection rate without paying for a
# large surplus of searches that get thrown away.
OVERSHOOT = 1.5

# Hard ceiling per run, independent of what the caller asks for. Generation can
# trivially produce more companies than anyone would upload by hand, and every
# candidate costs a verification search plus a full research pass downstream.
MAX_TARGET = 100

_JSON_BLOCK = re.compile(r"\[.*\]", re.DOTALL)


class LeadGenerationError(Exception):
    """Generation could not run at all (no LLM, no search). Distinct from
    "ran and found nothing", which is a legitimate empty result."""


@dataclass
class Candidate:
    """One LLM-proposed company, before verification. Nothing here is trusted."""

    name: str
    country: str | None = None
    domain_guess: str | None = None


@dataclass
class VerifiedLead:
    """A candidate that survived verification - a real, domain-resolved
    company, safe to persist."""

    name: str
    domain: str
    country: str | None
    confidence: float


@dataclass
class GenerationResult:
    verified: list[VerifiedLead] = field(default_factory=list)
    candidates_proposed: int = 0
    rejected_unresolvable: int = 0
    rejected_duplicate: int = 0
    warnings: list[str] = field(default_factory=list)


# ── candidate generation (LLM) ────────────────────────────────────────────


def _icp_summary(icp: IcpProfile) -> str:
    """The ICP as prompt text. Only criteria that are actually set appear -
    an unset field is not a constraint, so mentioning it would invent one."""
    lines: list[str] = []
    if icp.industries:
        lines.append(f"Industries: {', '.join(icp.industries)}")
    if icp.employee_min is not None or icp.employee_max is not None:
        low = f"{icp.employee_min:,}" if icp.employee_min is not None else "any"
        high = f"{icp.employee_max:,}" if icp.employee_max is not None else "any"
        lines.append(f"Employee count: {low} to {high}")
    if icp.revenue_min_usd is not None or icp.revenue_max_usd is not None:
        low = f"${icp.revenue_min_usd:,}" if icp.revenue_min_usd is not None else "any"
        high = f"${icp.revenue_max_usd:,}" if icp.revenue_max_usd is not None else "any"
        lines.append(f"Annual revenue: {low} to {high}")
    if icp.countries:
        lines.append(f"Headquarters countries: {', '.join(icp.countries)}")
    if icp.technologies:
        lines.append(f"Uses technologies: {', '.join(icp.technologies)}")
    if icp.departments:
        lines.append(f"Has these departments: {', '.join(icp.departments)}")
    if icp.buying_committee_personas:
        roles = ", ".join(p.replace("_", " ") for p in icp.buying_committee_personas)
        lines.append(f"Reachable roles of interest: {roles}")
    return "\n".join(lines) or "No specific constraints - any company that fits the seller's offering."


def _build_prompt(icp: IcpProfile, offering_summary: str, count: int, exclude: list[str]) -> str:
    exclusions = ""
    if exclude:
        # Cap the echoed list: the point is to steer away from repeats, and a
        # very long list would crowd out the actual instructions. Callers put
        # the entries they cannot afford to lose at the front.
        shown = ", ".join(exclude[:PROMPT_EXCLUDE_MAX])
        exclusions = (
            f"\nDo NOT propose any of these, they are already known:\n{shown}\n"
        )

    return (
        "You are helping a B2B sales team find companies to approach.\n\n"
        f"What the seller offers:\n{offering_summary}\n\n"
        f"Their ideal customer profile:\n{_icp_summary(icp)}\n"
        f"{exclusions}\n"
        f"Name {count} REAL companies that fit this profile and would plausibly buy what the "
        "seller offers.\n\n"
        "Rules:\n"
        "- Only real companies you are confident actually exist. Never invent a name.\n"
        "- Prefer less-obvious mid-market companies over famous household names.\n"
        "- Give the company's primary website domain if you know it, else null. "
        "Do not guess a domain from the name.\n"
        "- Do not include revenue, employee count or industry. Those are verified "
        "from real sources separately, and guesses are worse than nothing.\n\n"
        'Reply with ONLY a JSON array, no prose, no markdown fence:\n'
        '[{"name": "Acme Industries", "country": "United States", "domain": "acme.com"}]'
    )


def _parse_candidates(raw: str) -> list[Candidate]:
    """Extracts candidates from the model's reply.

    Tolerates a markdown fence or stray prose around the array, because a
    reply that is 95% right should not be discarded wholesale. A reply that
    cannot be parsed at all yields no candidates rather than raising - the
    caller treats that as a failed chunk and keeps the others.
    """
    if not raw:
        return []
    match = _JSON_BLOCK.search(raw)
    if not match:
        return []
    try:
        rows = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(rows, list):
        return []

    candidates: list[Candidate] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = (row.get("name") or "").strip()
        if not name:
            continue
        country = (row.get("country") or "").strip() or None
        domain_guess = zoominfo_mapper.normalize_domain(row.get("domain"))
        candidates.append(Candidate(name=name, country=country, domain_guess=domain_guess))
    return candidates


async def propose_candidates(
    icp: IcpProfile,
    offering_profile: dict,
    target: int,
    trace_user_id: str | None = None,
    exclude_names: list[str] | None = None,
) -> tuple[list[Candidate], list[str]]:
    """Unverified LLM candidates for one ICP. Persists nothing.

    Returns (candidates, warnings). Candidates are deduplicated by name within
    the run, and each chunk excludes what earlier chunks already produced so
    the model does not simply repeat its most obvious answers.

    `exclude_names` are companies the organisation ALREADY has (see
    existing_company_names). They steer the model off names that would be
    discarded as duplicates later anyway - after a verification search has
    already been spent on each.
    """
    if not llm_client.is_configured():
        raise LeadGenerationError(
            "Lead generation needs the LLM service, which is not configured (LLM_API_KEY)."
        )

    offering_summary = _summarise_offering(offering_profile)
    wanted = int(target * OVERSHOOT) + 1

    seen: dict[str, Candidate] = {}
    warnings: list[str] = []
    chunk_index = 0

    owned = list(exclude_names or ())

    while len(seen) < wanted:
        remaining = wanted - len(seen)
        ask = min(CHUNK_SIZE, remaining)
        # This run's candidates first: _build_prompt truncates a long list, and
        # losing them would let the model repeat what it just proposed, which
        # stalls the loop. Owned names are the steer, not the correctness guard
        # - drop_existing_companies still backstops a model that ignores them.
        exclusions = [c.name for c in seen.values()] + owned
        prompt = _build_prompt(icp, offering_summary, ask, exclusions)
        try:
            raw = await llm_client.complete(
                [{"role": "user", "content": prompt}],
                generation_name="generate-icp-leads",
                trace_user_id=trace_user_id,
            )
        except Exception as exc:
            warnings.append(f"Candidate generation call failed: {type(exc).__name__}: {exc}")
            break

        fresh = [c for c in _parse_candidates(raw) if c.name.lower() not in seen]
        if not fresh:
            # The model is repeating itself or returned nothing usable. Looping
            # again would burn tokens for the same result.
            warnings.append(
                "The model stopped producing new candidates before reaching the target."
            )
            break
        for candidate in fresh:
            seen[candidate.name.lower()] = candidate

        chunk_index += 1
        if chunk_index > 20:  # belt-and-braces against a pathological loop
            break

    return list(seen.values()), warnings


def _summarise_offering(offering_profile: dict) -> str:
    """Reuses the exact offering summary the scoring pipeline feeds its prompts,
    so generation and relevance scoring agree on what "relevant" means - a
    company generated as a good fit should not then be scored as irrelevant.

    Imported locally (and defensively) because it is internal to
    buying_event_service: sharing the real thing is worth more than a private
    copy that could silently drift, but generation must not break if that
    helper is ever renamed.
    """
    profile = offering_profile or {}
    try:
        from app.services.buying_event_service import _offering_summary

        return _offering_summary(profile)
    except (ImportError, AttributeError):  # pragma: no cover - defensive
        offerings = ", ".join(
            o.get("name", "") for o in profile.get("offerings", [])[:8] if o.get("name")
        )
        return offerings or "AI strategy, data, agents, automation, governance, managed AI ops"


# ── verification ──────────────────────────────────────────────────────────


async def _verify_one(candidate: Candidate, semaphore: asyncio.Semaphore) -> tuple[Candidate, VerifiedLead | None, str]:
    """One candidate -> one search -> a resolved domain, or a reason it failed.

    Never raises: one bad lookup must not abort the run.
    """
    query = " ".join(x for x in [candidate.name, candidate.country, "official website"] if x)
    async with semaphore:
        try:
            results = await you_client.search_query(query)
        except Exception as exc:
            return candidate, None, f"search failed: {type(exc).__name__}: {exc}"

    domain, confidence, reason = company_enrichment.resolve_domain(candidate.name, results)
    if not domain:
        return candidate, None, reason

    return (
        candidate,
        VerifiedLead(
            name=candidate.name,
            domain=domain,
            country=candidate.country,
            confidence=confidence,
        ),
        reason,
    )


async def verify_candidates(candidates: list[Candidate]) -> tuple[list[VerifiedLead], int]:
    """Confirms each candidate exists and resolves its real domain.

    This is the gate that keeps hallucinated companies out of the database.
    The LLM's own domain guess is never used - only a domain independently
    resolved from search results is accepted, and `resolve_domain` refuses to
    guess below its confidence floor.

    Returns (verified, rejected_count).
    """
    if not candidates:
        return [], 0
    if not you_client.is_configured():
        raise LeadGenerationError(
            "Lead generation needs web search to verify companies, which is not "
            "configured (YOU_API_KEY). Without it, unverified LLM output would be "
            "written to the database."
        )

    semaphore = asyncio.Semaphore(VERIFY_CONCURRENCY)
    outcomes = await asyncio.gather(*(_verify_one(c, semaphore) for c in candidates))

    verified: list[VerifiedLead] = []
    rejected = 0
    for candidate, lead, reason in outcomes:
        if lead is None:
            rejected += 1
            logger.info("generated candidate rejected: %s - %s", candidate.name, reason)
            continue
        verified.append(lead)

    # One domain can resolve from two differently-spelled names ("Acme Corp",
    # "Acme Corporation"). Collapse here, keeping the highest confidence, so a
    # single company never enters the batch twice.
    by_domain: dict[str, VerifiedLead] = {}
    for lead in verified:
        existing = by_domain.get(lead.domain)
        if existing is None or lead.confidence > existing.confidence:
            by_domain[lead.domain] = lead

    return list(by_domain.values()), rejected


# ── deduplication against what the org already has ────────────────────────


async def existing_company_names(
    session: AsyncSession,
    organisation_id: UUID,
    icp: IcpProfile,
    limit: int = EXCLUDE_NAME_LIMIT,
) -> list[str]:
    """Names the organisation already holds, for the prompt's exclusion list.

    Without this the model is only told what it proposed earlier in the SAME
    run, so on every subsequent run it proposes the same well-known companies,
    all of them already in the database. That failure is silent and expensive:
    the duplicates are only detected by drop_existing_companies AFTER a
    verification search has been paid for on each one, and the run then reports
    zero new companies.

    An organisation can hold thousands of companies and only a couple of
    hundred names fit in a prompt that still has to be mostly instructions, so
    the budget goes to companies whose industry overlaps the ICP's - precisely
    the ones the model is likely to propose for this ICP.
    """
    stmt = select(Company.company_name).where(
        Company.organisation_id == organisation_id,
        Company.company_name.isnot(None),
    )

    industries = [i for i in (icp.industries or []) if i]
    if industries:
        stmt = stmt.order_by(
            case((Company.primary_industry.overlap(industries), 0), else_=1),
            Company.company_name,
        )
    else:
        stmt = stmt.order_by(Company.company_name)

    rows = (await session.execute(stmt.limit(limit))).scalars().all()
    return [name for name in rows if name]


async def drop_existing_companies(
    session: AsyncSession, organisation_id: UUID, leads: list[VerifiedLead]
) -> tuple[list[VerifiedLead], int]:
    """Removes leads whose domain the organisation already has.

    Deliberately runs on the RESOLVED domain, after verification - matching on
    the LLM's guessed domain would both miss real duplicates (wrong guess) and
    discard good leads (coincidental guess).
    """
    if not leads:
        return [], 0

    domains = {lead.domain for lead in leads}
    existing = set(
        (
            await session.execute(
                select(Company.company_domain).where(
                    Company.organisation_id == organisation_id,
                    Company.company_domain.in_(domains),
                )
            )
        ).scalars().all()
    )
    if not existing:
        return leads, 0

    kept = [lead for lead in leads if lead.domain not in existing]
    return kept, len(leads) - len(kept)


# ── orchestration ─────────────────────────────────────────────────────────


async def generate_leads(
    session: AsyncSession,
    organisation_id: UUID,
    icp: IcpProfile,
    target: int,
) -> GenerationResult:
    """Full generation pass: propose -> verify -> deduplicate. Persists nothing.

    The caller turns the result into company rows and a batch; keeping this
    side-effect-free makes the expensive, failure-prone part independently
    testable.
    """
    target = max(1, min(target, MAX_TARGET))

    org = await session.get(Organisation, organisation_id)
    offering_profile = offering_profile_service.profile_for_scoring(org)

    owned = await existing_company_names(session, organisation_id, icp)

    candidates, warnings = await propose_candidates(
        icp,
        offering_profile,
        target,
        trace_user_id=str(organisation_id),
        exclude_names=owned,
    )
    result = GenerationResult(candidates_proposed=len(candidates), warnings=warnings)
    if not candidates:
        return result

    verified, rejected = await verify_candidates(candidates)
    result.rejected_unresolvable = rejected

    kept, duplicates = await drop_existing_companies(session, organisation_id, verified)
    result.rejected_duplicate = duplicates

    # Highest-confidence first, so trimming to the target keeps the best
    # matches rather than an arbitrary slice.
    kept.sort(key=lambda lead: lead.confidence, reverse=True)
    result.verified = kept[:target]

    if rejected:
        result.warnings.append(
            f"{rejected} proposed compan{'y' if rejected == 1 else 'ies'} could not be "
            "verified as real and were discarded."
        )
    if duplicates:
        result.warnings.append(
            f"{duplicates} proposed compan{'y' if duplicates == 1 else 'ies'} were already "
            "in your data and were skipped."
        )
    return result


def to_company_rows(leads: list[VerifiedLead], organisation_id: UUID) -> list[dict]:
    """Verified leads as `company` insert rows, in the canonical shape
    excel_pipeline already upserts.

    zi_company_id is derived from the RESOLVED domain, so re-running the same
    ICP recomputes the same identity and updates the existing row rather than
    inserting a duplicate. Firmographics are left NULL on purpose: enrichment
    fills them from real sources during the background pass, and anything the
    LLM might have offered would be invention.
    """
    rows: list[dict] = []
    for lead in leads:
        zi_company_id = table_mapper.synthetic_bigint("generated-company", lead.domain)
        rows.append(
            {
                "ZoomInfo Company ID": zi_company_id,
                # Present-but-None, matching what table_mapper emits for a
                # contactless row: upsert_rows builds a decision-maker row for
                # every row and indexes this key directly, so omitting it
                # raises. A None person id is skipped downstream, which is the
                # correct outcome - a generated company has no contacts yet.
                "ZoomInfo Contact ID": None,
                "Company Name": lead.name,
                "Website": lead.domain,
                "Company Country": lead.country,
            }
        )
    return rows
