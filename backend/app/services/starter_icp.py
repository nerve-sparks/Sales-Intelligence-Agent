"""Starter ICP - the first, editable ICP the system creates for a new
organisation, so the ICP page isn't empty after onboarding (which has no ICP
step since 2ba62a9).

Two layers, so there is always something useful even with no LLM:

  * fallback_values() - deterministic, from what onboarding collected
    (industry, headquarters) plus the Offering Profile's technologies and a
    default decision-maker set, with a descriptive name.
  * _llm_values() - one LLM call over the company + Offering Profile that
    picks target industries, company size, revenue, countries, technologies
    and personas. Every value is validated against the same vocabularies the
    ICP form offers, so nothing it produces is uneditable there; anything
    invalid or missing falls back to the deterministic layer.

The row is flagged auto_generated. While the flag is set it is re-filled
whenever the Offering Profile is saved or synced (refresh_starter_icps); the
first user edit (icp_service.update_icp) clears it, and it is never touched
again. Departments are deliberately left unset - the ICP form no longer
offers them.
"""

from __future__ import annotations

import json
import logging
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_maker
from app.core.industry_sectors import SECTOR_INDUSTRIES
from app.models import PERSONA_VALUES, IcpProfile, Organisation, Workspace
from app.services import llm_client
from app.services.icp_service import create_icp
from app.services.offering_profile_service import normalize_profile

logger = logging.getLogger(__name__)

# Same lists as the ICP form (frontend IcpPage.tsx COUNTRY_OPTIONS /
# EMPLOYEE_BANDS / REVENUE_BANDS) - a value outside them couldn't be edited.
STARTER_COUNTRIES: tuple[str, ...] = (
    "United States", "Canada", "United Kingdom", "Ireland", "Germany", "France",
    "Belgium", "Denmark", "Sweden", "Finland", "Russia", "Israel", "India",
    "Singapore", "Australia",
)
EMPLOYEE_BANDS: tuple[tuple[int, int | None], ...] = (
    (1, 10), (11, 50), (51, 200), (201, 500), (501, 1000), (1000, None),
)
REVENUE_BANDS: tuple[tuple[int, int | None], ...] = (
    (0, 1_000_000), (1_000_000, 10_000_000), (10_000_000, 50_000_000),
    (50_000_000, 100_000_000), (100_000_000, 250_000_000), (250_000_000, None),
)
ALL_INDUSTRIES: tuple[str, ...] = tuple(i for industries in SECTOR_INDUSTRIES.values() for i in industries)
# A B2B buying committee's usual decision-makers, when nothing better is known.
DEFAULT_PERSONAS: tuple[str, ...] = ("ceo", "cto", "cio")
MAX_TECHNOLOGIES = 6
MAX_NAME_LENGTH = 80
FALLBACK_NAME = "Starter ICP"

_COUNTRY_ALIASES: dict[str, tuple[str, ...]] = {
    "usa": ("United States",),
    "us": ("United States",),
    "u.s.": ("United States",),
    "u.s.a.": ("United States",),
    "uk": ("United Kingdom",),
    "england": ("United Kingdom",),
    "north america": ("United States", "Canada"),
}


def _contains_words(haystack: str, needle: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(needle)}(?![a-z])", haystack) is not None


def _starter_industries(industry: str | None) -> list[str] | None:
    """Map free-text industry onto the ICP vocabulary (industry_sectors).
    None = no industry criterion (any industry)."""
    text = (industry or "").strip().lower()
    if not text:
        return None
    for sector, industries in SECTOR_INDUSTRIES.items():
        if text == sector.lower():
            return list(industries)
    exact = [i for i in ALL_INDUSTRIES if i.lower() == text]
    if exact:
        return exact
    # Whole-word containment either way ("SaaS Software" -> Software), never a
    # substring - "IT" must not match "Hospitality".
    if len(text) < 3:
        return None
    partial = [i for i in ALL_INDUSTRIES if _contains_words(text, i.lower()) or _contains_words(i.lower(), text)]
    return partial or None


def _starter_countries(headquarters: str | None) -> list[str] | None:
    """Countries named in a location, e.g. "San Francisco, California, USA"
    -> ["United States"]. None = any country."""
    text = (headquarters or "").strip().lower()
    if not text:
        return None
    found: list[str] = []
    for country in STARTER_COUNTRIES:
        if _contains_words(text, country.lower()) and country not in found:
            found.append(country)
    for alias, countries in _COUNTRY_ALIASES.items():
        if _contains_words(text, alias):
            found.extend(c for c in countries if c not in found)
    return found or None


def _profile_technologies(offering_profile: dict | None) -> list[str] | None:
    if not offering_profile:
        return None
    raw = list(offering_profile.get("relevant_technologies") or [])
    for offering in offering_profile.get("offerings") or []:
        if isinstance(offering, dict):
            raw.extend(offering.get("technologies") or [])
    seen: list[str] = []
    for tech in raw:
        if isinstance(tech, str) and tech.strip() and tech.strip().lower() not in {s.lower() for s in seen}:
            seen.append(tech.strip())
    return seen[:MAX_TECHNOLOGIES] or None


def _join_short(values: list[str]) -> str:
    if len(values) <= 2:
        return " & ".join(values)
    return f"{values[0]}, {values[1]} +{len(values) - 2}"


def starter_name(values: dict, org: Organisation) -> str:
    """Descriptive name from the criteria, e.g. "Software companies in United
    States & Canada"."""
    industries = values.get("industries") or []
    countries = values.get("countries") or []
    if industries and countries:
        name = f"{_join_short(industries)} companies in {_join_short(countries)}"
    elif industries:
        name = f"{_join_short(industries)} companies"
    elif countries:
        name = f"Companies in {_join_short(countries)}"
    elif (org.company_name or "").strip():
        name = f"{org.company_name.strip()} target customers"
    else:
        name = FALLBACK_NAME
    return name[:MAX_NAME_LENGTH]


def fallback_values(org: Organisation) -> dict:
    """Deterministic Starter ICP - no LLM involved."""
    values = {
        "industries": _starter_industries(org.industry),
        "countries": _starter_countries(org.headquarters_location),
        "technologies": _profile_technologies(normalize_profile(org.offering_profile or {})),
        "buying_committee_personas": list(DEFAULT_PERSONAS),
        "employee_min": None,
        "employee_max": None,
        "revenue_min_usd": None,
        "revenue_max_usd": None,
    }
    values["name"] = starter_name(values, org)
    return values


def _llm_prompt(org: Organisation) -> str:
    profile = normalize_profile(org.offering_profile or {})
    offerings = [
        {"name": o.get("name"), "problems_solved": o.get("problems_solved")}
        for o in (profile.get("offerings") or [])
        if isinstance(o, dict)
    ]
    company = {
        "company_name": org.company_name,
        "industry": org.industry,
        "headquarters": org.headquarters_location,
        "description": org.company_description,
        "positioning": profile.get("positioning"),
        "offerings": offerings[:8],
        "relevant_technologies": profile.get("relevant_technologies"),
    }
    bands = lambda b: [f"{i}: {lo:,}-{hi:,}" if hi else f"{i}: {lo:,}+" for i, (lo, hi) in enumerate(b)]  # noqa: E731
    return (
        "You define the Ideal Customer Profile (ICP) for a B2B company: the kind of companies "
        "most likely to BUY what it sells. Base it only on the company below.\n\n"
        f"Company:\n{json.dumps(company, indent=2, default=str)}\n\n"
        "Respond with ONLY this JSON, no prose or markdown:\n"
        '{"name": "", "industries": [], "employee_band": null, "revenue_band": null, '
        '"countries": [], "technologies": [], "personas": []}\n\n'
        "Rules:\n"
        "- name: a short descriptive ICP name (max 60 characters), e.g. "
        '"Mid-market software companies in North America".\n'
        f"- industries: 1-4 values, ONLY from: {json.dumps(list(ALL_INDUSTRIES))}\n"
        f"- employee_band: the index of the best target company size, from: {bands(EMPLOYEE_BANDS)}; null if unclear.\n"
        f"- revenue_band: the index of the best target annual revenue (USD), from: {bands(REVENUE_BANDS)}; null if unclear.\n"
        f"- countries: 1-5 target markets, ONLY from: {json.dumps(list(STARTER_COUNTRIES))}\n"
        f"- technologies: up to {MAX_TECHNOLOGIES} technologies the TARGET customers typically use.\n"
        f"- personas: 2-5 decision-makers who buy this, ONLY from: {json.dumps(list(PERSONA_VALUES))}\n"
    )


def _validate_llm(raw: dict) -> dict:
    """Keep only values the ICP form can represent; drop the rest."""
    out: dict = {}

    def pick(key: str, allowed, limit: int) -> list[str] | None:
        lookup = {a.lower(): a for a in allowed}
        values = raw.get(key) if isinstance(raw.get(key), list) else []
        picked: list[str] = []
        for v in values:
            match = lookup.get(str(v).strip().lower())
            if match and match not in picked:
                picked.append(match)
        return picked[:limit] or None

    out["industries"] = pick("industries", ALL_INDUSTRIES, 4)
    out["countries"] = pick("countries", STARTER_COUNTRIES, 5)
    out["buying_committee_personas"] = pick("personas", PERSONA_VALUES, 5)
    techs = raw.get("technologies") if isinstance(raw.get("technologies"), list) else []
    out["technologies"] = [t.strip() for t in techs if isinstance(t, str) and t.strip()][:MAX_TECHNOLOGIES] or None
    for key, bands, lo_key, hi_key in (
        ("employee_band", EMPLOYEE_BANDS, "employee_min", "employee_max"),
        ("revenue_band", REVENUE_BANDS, "revenue_min_usd", "revenue_max_usd"),
    ):
        index = raw.get(key)
        if isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(bands):
            out[lo_key], out[hi_key] = bands[index]
    name = raw.get("name")
    if isinstance(name, str) and name.strip():
        out["name"] = name.strip()[:MAX_NAME_LENGTH]
    return out


async def _llm_values(org: Organisation) -> dict | None:
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _llm_prompt(org)}],
            generation_name="suggest-starter-icp",
            temperature=0,
            trace_user_id=str(org.organisation_id),
        )
    except Exception as exc:
        logger.warning("Starter ICP LLM call failed: %s: %s", type(exc).__name__, exc)
        return None
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    return _validate_llm(parsed) if isinstance(parsed, dict) else None


async def build_starter_values(org: Organisation, *, use_llm: bool) -> dict:
    """Deterministic values, overridden field-by-field by any valid LLM value."""
    values = fallback_values(org)
    if use_llm:
        suggested = await _llm_values(org) or {}
        for key, value in suggested.items():
            if value is not None:
                values[key] = value
        # Keep min/max pairs consistent: an LLM band replaces both ends.
        if "employee_min" in suggested:
            values["employee_max"] = suggested.get("employee_max")
        if "revenue_min_usd" in suggested:
            values["revenue_max_usd"] = suggested.get("revenue_max_usd")
        if "name" not in suggested:
            values["name"] = starter_name(values, org)
    return values


async def create_starter_icp(
    session: AsyncSession, workspace_id: UUID, org: Organisation, *, use_llm: bool = False
) -> IcpProfile:
    values = await build_starter_values(org, use_llm=use_llm)
    return await create_icp(session, workspace_id, {**values, "auto_generated": True})


async def refresh_starter_icps(session: AsyncSession, organisation_id: UUID, *, use_llm: bool = True) -> int:
    """Re-fill this organisation's still-unedited Starter ICP(s) from the
    current company + Offering Profile. Returns how many were updated."""
    org = await session.get(Organisation, organisation_id)
    if org is None:
        return 0
    starters = (
        await session.execute(
            select(IcpProfile)
            .join(Workspace, Workspace.workspace_id == IcpProfile.workspace_id)
            .where(Workspace.organisation_id == organisation_id, IcpProfile.auto_generated.is_(True))
        )
    ).scalars().all()
    if not starters:
        return 0
    values = await build_starter_values(org, use_llm=use_llm)
    for icp in starters:
        for key, value in values.items():
            setattr(icp, key, value)
    await session.commit()
    return len(starters)


async def refresh_starter_icps_in_background(organisation_id: UUID) -> None:
    """BackgroundTasks entry point - own session, never raises."""
    try:
        async with async_session_maker() as session:
            await refresh_starter_icps(session, organisation_id)
    except Exception:
        logger.exception("Could not refresh starter ICP for organisation %s", organisation_id)
