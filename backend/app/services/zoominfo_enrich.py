"""ZoomInfo Enrich orchestration: call the live API, map the response onto
our models, upsert, return the saved row(s).

Field-name mapping confidence, per resource (see conversation/docs review):
- company:       HIGH  - full request/response schema confirmed from docs.
                         matchCompanyInput (controller's CompanyMatchCriteria)
                         mirrors ZoomInfo's full schema since match fields
                         are call-identification inputs, not stored data.
                         outputFields is trimmed to the Company model's
                         actual columns - no point asking ZoomInfo to
                         return data (ticker/phone) we never persist
- contact:       HIGH  - full request/response schema confirmed from docs,
                         same split as company: matchPersonInput mirrors
                         ZoomInfo's full schema, outputFields trimmed to
                         DecisionMaker's actual columns. externalUrls'
                         per-entry shape ({type, url}) is assumed
                         consistent with company's socialMediaUrls, not
                         separately confirmed
- scoop/news:    HIGH  - request body confirmed field-by-field from docs;
                         response fields inferred from symmetry with our
                         own CompanyScoop/CompanyNews columns
- technologies:  HIGH  - request body confirmed (bare companyId int64);
                         response fields confirmed (category, vendor,
                         product, website, domain)
- intent:        MED   - request body confirmed field-by-field from docs;
                         response attributes (category, topic, signalScore,
                         signalDate, recommendedContacts) inferred from the
                         documented sort-field list - sortable fields are
                         necessarily real response fields, but the exact
                         casing/shape of recommendedContacts and whether
                         each record has a top-level "id" (used to build
                         intent_id) are assumed consistent with every other
                         Enrich resource, not directly confirmed

None of this has been exercised against a live ZoomInfo account yet -
verify field names against a real response as soon as credentials exist.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, CompanyIntent, CompanyNews, CompanyScoop, DecisionMaker
from app.services import zoominfo_client
from app.services.zoominfo_mapper import classify_persona, company_uuid, parse_date, parse_iso_date


def _parse_signal_date(value):
    """Intent's date fields are documented as YYYY-MM-DD in the request
    (signalStartDate/signalEndDate); the response's signalDate is assumed
    to follow the same plain-date format rather than scoop/news's full
    ISO datetime, so try both.
    """
    parsed = parse_iso_date(value)
    if parsed:
        return parsed
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%d")
    except ValueError:
        return None

# ── COMPANY ──────────────────────────────────────────────────────────────────

COMPANY_OUTPUT_FIELDS = [
    "id", "name", "website", "revenue", "revenueRange", "employeeCount",
    "employeeRange", "employeeGrowth", "industries", "primaryIndustry",
    "foundedYear", "description", "logo", "country", "state", "city",
    "continent", "companyStatus", "certified", "socialMediaUrls",
    "companyFunding", "totalFundingAmount", "recentFundingAmount",
    "recentFundingDate", "competitors", "products",
]


def _map_company_response(attrs: dict, zi_company_id: int, organisation_id: UUID) -> dict:
    primary_industry = attrs.get("primaryIndustry")
    if isinstance(primary_industry, str):
        primary_industry = [primary_industry]

    return {
        "zi_company_id": zi_company_id,
        "company_id": company_uuid(organisation_id, zi_company_id),
        "organisation_id": organisation_id,
        "company_name": attrs.get("name"),
        "company_domain": attrs.get("website"),
        "company_status": attrs.get("companyStatus"),
        "is_verified": bool(attrs.get("certified")),
        "employee_count": attrs.get("employeeCount"),
        "employee_range": attrs.get("employeeRange"),
        "employee_growth": attrs.get("employeeGrowth"),
        "revenue_usd": attrs.get("revenue"),
        "revenue_range": attrs.get("revenueRange"),
        "founded_year": str(attrs["foundedYear"]) if attrs.get("foundedYear") else None,
        "description": attrs.get("description"),
        "logo_url": attrs.get("logo"),
        "city": attrs.get("city"),
        "state": attrs.get("state"),
        "country": attrs.get("country"),
        "continent": attrs.get("continent"),
        "primary_industry": primary_industry,
        "industries": attrs.get("industries"),
        "linkedin_url": next(
            (u["url"] for u in attrs.get("socialMediaUrls", []) if u.get("type") == "LINKED_IN"), None
        ),
        "twitter_url": next(
            (u["url"] for u in attrs.get("socialMediaUrls", []) if u.get("type") == "TWITTER"), None
        ),
        "facebook_url": next(
            (u["url"] for u in attrs.get("socialMediaUrls", []) if u.get("type") == "FACEBOOK"), None
        ),
        "total_funding_amount": attrs.get("totalFundingAmount"),
        "recent_funding_amount": attrs.get("recentFundingAmount"),
        "recent_funding_date": parse_date(attrs.get("recentFundingDate")),
        "company_funding": attrs.get("companyFunding"),
        "competitors": attrs.get("competitors"),
        "products": attrs.get("products"),
    }


async def enrich_company(session: AsyncSession, organisation_id: UUID, criteria: dict) -> Company:
    response = await zoominfo_client.post(
        "companies/enrich",
        "CompanyEnrich",
        {"matchCompanyInput": [criteria], "outputFields": COMPANY_OUTPUT_FIELDS},
    )
    matches = response.get("data") or []
    if not matches:
        raise ValueError("ZoomInfo returned no match for the given criteria")

    attrs = matches[0]["attributes"]
    zi_company_id = int(matches[0]["id"])
    row = _map_company_response(attrs, zi_company_id, organisation_id)

    update_cols = {c: row[c] for c in row if c not in ("zi_company_id", "company_id", "organisation_id")}
    stmt = (
        pg_insert(Company)
        .values(row)
        .on_conflict_do_update(index_elements=["organisation_id", "zi_company_id"], set_=update_cols)
        .returning(Company)
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.scalar_one()


# ── CONTACT ──────────────────────────────────────────────────────────────────

CONTACT_OUTPUT_FIELDS = [
    "id", "firstName", "lastName", "picture", "jobTitle", "jobFunction",
    "yearsOfExperience", "email", "phone", "mobilePhone", "externalUrls",
]


async def enrich_contact(session: AsyncSession, organisation_id: UUID, criteria: dict, company_id: UUID) -> DecisionMaker:
    response = await zoominfo_client.post(
        "contacts/enrich",
        "ContactEnrich",
        {"matchPersonInput": [criteria], "outputFields": CONTACT_OUTPUT_FIELDS},
    )
    matches = response.get("data") or []
    if not matches:
        raise ValueError("ZoomInfo returned no match for the given contact criteria")

    attrs = matches[0]["attributes"]
    job_title = attrs.get("jobTitle")
    years_of_experience = attrs.get("yearsOfExperience")
    row = {
        "zi_person_id": int(matches[0]["id"]),
        "organisation_id": organisation_id,
        "company_id": company_id,
        "first_name": attrs.get("firstName"),
        "last_name": attrs.get("lastName"),
        "picture_url": attrs.get("picture"),
        "job_title": job_title,
        "department": attrs.get("jobFunction"),
        "years_of_experience": str(years_of_experience) if years_of_experience is not None else None,
        "persona": classify_persona(job_title),
        "email": attrs.get("email"),
        "phone": attrs.get("phone"),
        "mobile_phone": attrs.get("mobilePhone"),
        "linkedin_url": next(
            (u["url"] for u in attrs.get("externalUrls", []) if u.get("type") == "LINKED_IN"), None
        ),
    }
    update_cols = {c: row[c] for c in row if c not in ("zi_person_id", "organisation_id")}
    stmt = (
        pg_insert(DecisionMaker)
        .values(row)
        .on_conflict_do_update(index_elements=["organisation_id", "zi_person_id"], set_=update_cols)
        .returning(DecisionMaker)
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.scalar_one()


# ── SCOOPS ───────────────────────────────────────────────────────────────────

async def enrich_scoops(
    session: AsyncSession, organisation_id: UUID, company_id: UUID, filters: dict | None = None
) -> list[CompanyScoop]:
    """companyId here is a string (per ZoomInfo's Scoop Enrich schema,
    unlike Technology Enrich's int64) - pulled from the Company row we
    already enriched. `filters` carries any of the optional caller-supplied
    fields (date range, scoopType, scoopTopic, department, description).
    """
    company = await session.get(Company, company_id)
    if company is None or company.organisation_id != organisation_id:
        raise ValueError("company not found for this organisation")

    criteria = {"companyId": str(company.zi_company_id)}
    if filters:
        criteria.update(filters)

    response = await zoominfo_client.post("scoops/enrich", "ScoopEnrich", criteria)
    records = response.get("data") or []

    rows = []
    for record in records:
        attrs = record["attributes"]
        rows.append({
            "scoop_id": f"{organisation_id}:{record['id']}",
            "company_id": company_id,
            "description": attrs.get("description"),
            "published_date": parse_iso_date(attrs.get("originalPublishedDate") or attrs.get("publishedDate")),
            "topics": [{"topic": attrs["scoopTopic"]}] if attrs.get("scoopTopic") else None,
            "types": [{"type": attrs["scoopType"]}] if attrs.get("scoopType") else None,
        })

    if rows:
        stmt = pg_insert(CompanyScoop).values(rows).on_conflict_do_nothing(index_elements=["scoop_id"])
        await session.execute(stmt)
        await session.commit()

    return rows


# ── NEWS ─────────────────────────────────────────────────────────────────────

async def enrich_news(
    session: AsyncSession, organisation_id: UUID, company_id: UUID, filters: dict | None = None
) -> list[CompanyNews]:
    """companyId here is int64 (per ZoomInfo's News Enrich schema, same as
    Technology Enrich) - pulled from the Company row we already enriched.
    `filters` carries any of the optional caller-supplied fields
    (categories, url, pageDateMin/Max).
    """
    company = await session.get(Company, company_id)
    if company is None or company.organisation_id != organisation_id:
        raise ValueError("company not found for this organisation")

    criteria = {"companyId": company.zi_company_id}
    if filters:
        criteria.update(filters)

    response = await zoominfo_client.post("news/enrich", "NewsEnrich", criteria)
    records = response.get("data") or []

    rows = []
    for record in records:
        attrs = record["attributes"]
        natural_key = attrs.get("url") or record["id"]
        rows.append({
            "news_id": f"{organisation_id}:{natural_key}",
            "company_id": company_id,
            "domain": attrs.get("domain"),
            "title": attrs.get("title"),
            "description": attrs.get("description"),
            "category": attrs.get("category"),
            "page_date": parse_iso_date(attrs.get("pageDate") or attrs.get("publishedDate")),
        })

    if rows:
        stmt = pg_insert(CompanyNews).values(rows).on_conflict_do_nothing(index_elements=["news_id"])
        await session.execute(stmt)
        await session.commit()

    return rows


# ── INTENT ───────────────────────────────────────────────────────────────────

async def enrich_intent(
    session: AsyncSession, organisation_id: UUID, company_id: UUID, filters: dict
) -> list[CompanyIntent]:
    """companyId here is int64, pulled from the Company row we already
    enriched. `topics` is required by ZoomInfo's schema and must come from
    `filters` (the caller). intent_id is derived the same way as
    scoop_id/news_id - `{organisation_id}:{record['id']}` - assuming
    Intent's response envelope follows the same id/type/attributes shape
    confirmed for every other Enrich resource.
    """
    company = await session.get(Company, company_id)
    if company is None or company.organisation_id != organisation_id:
        raise ValueError("company not found for this organisation")

    criteria = {"companyId": company.zi_company_id}
    criteria.update(filters)

    response = await zoominfo_client.post("intent/enrich", "IntentEnrich", criteria)
    records = response.get("data") or []

    rows = []
    for record in records:
        attrs = record["attributes"]
        rows.append({
            "intent_id": f"{organisation_id}:{record['id']}",
            "company_id": company_id,
            "category": attrs.get("category"),
            "topic": attrs.get("topic"),
            "signal_score": attrs.get("signalScore"),
            "signal_date": _parse_signal_date(attrs.get("signalDate")),
            "recommended_contacts": attrs.get("recommendedContacts"),
        })

    if not rows:
        return []

    stmt = pg_insert(CompanyIntent).values(rows).on_conflict_do_nothing(index_elements=["intent_id"])
    await session.execute(stmt)
    await session.commit()

    intent_ids = [row["intent_id"] for row in rows]
    result = await session.execute(select(CompanyIntent).where(CompanyIntent.intent_id.in_(intent_ids)))
    return list(result.scalars().all())


# ── TECHNOLOGIES ─────────────────────────────────────────────────────────────

async def enrich_technologies(session: AsyncSession, organisation_id: UUID, company_id: UUID) -> Company:
    """Technology Enrich's request schema only accepts a bare `companyId`
    (ZoomInfo's numeric id, no name/website fallback) - so we pull the
    zi_company_id off the Company row we already enriched, rather than
    asking the caller to supply match criteria.
    """
    company = await session.get(Company, company_id)
    if company is None or company.organisation_id != organisation_id:
        raise ValueError("company not found for this organisation")

    response = await zoominfo_client.post(
        "companies/technologies/enrich", "TechnologyEnrich", {"companyId": company.zi_company_id}
    )
    records = response.get("data") or []
    tech_names = [r["attributes"]["product"] for r in records if r.get("attributes", {}).get("product")]

    stmt = (
        update(Company)
        .where(Company.company_id == company_id, Company.organisation_id == organisation_id)
        .values(technologies=tech_names)
        .returning(Company)
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.scalar_one()
