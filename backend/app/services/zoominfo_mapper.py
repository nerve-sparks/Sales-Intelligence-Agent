"""Shared ZoomInfo export parsing/mapping helpers.

Used by both the Excel upload pipeline (services/excel_pipeline.py) and any
future CLI import script. Reads either .csv or .xlsx exports (same column
names in both) and maps rows onto company / decision_maker / company_intent /
company_scoop / company_news column dicts.
"""

import csv
import hashlib
import io
import re
import uuid
from datetime import datetime

import openpyxl

# ── FILE READING (csv or xlsx -> list[dict], same keys either way) ──────────


def read_rows(filename: str, content: bytes) -> list[dict]:
    if filename.lower().endswith(".xlsx"):
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        header = [str(h) if h is not None else "" for h in next(rows_iter)]
        return [dict(zip(header, row)) for row in rows_iter]

    text = content.decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


# ── PERSONA CLASSIFICATION (job title -> decision_maker.persona enum) ────────

PERSONA_RULES = [
    ("chief_ai_officer", ["chief ai officer", "chief artificial intelligence officer"]),
    ("chief_data_officer", ["chief data officer"]),
    ("chief_product_officer", ["chief product officer"]),
    ("chief_strategy_officer", ["chief strategy officer"]),
    ("chief_revenue_officer", ["chief revenue officer"]),
    ("chief_marketing_officer", ["chief marketing officer"]),
    ("chief_sales_officer", ["chief sales officer"]),
    ("chro", ["chief human resources officer", "chief people officer"]),
    ("general_counsel", ["general counsel"]),
    ("ciso", ["chief information security officer"]),
    ("chairman", ["chairman"]),
    ("board_member", ["board member"]),
    ("co_founder", ["co-founder", "co founder"]),
    ("founder", ["founder"]),
    ("ceo", ["chief executive officer"]),
    ("cto", ["chief technology officer"]),
    ("cfo", ["chief financial officer"]),
    ("coo", ["chief operating officer"]),
    ("cio", ["chief information officer"]),
    ("evp", ["executive vice president"]),
    ("svp", ["senior vice president"]),
    ("vp_sales", ["vice president, sales", "vice president of sales", "vp sales", "vp, sales"]),
    ("vp_operations", ["vice president, operations", "vice president of operations", "vp operations"]),
    ("managing_director", ["managing director"]),
    ("president", ["president"]),
    ("general_manager", ["general manager"]),
    ("director", ["director"]),
]


def classify_persona(job_title: str | None) -> str | None:
    if not job_title:
        return None
    title = str(job_title).lower()
    for persona, keywords in PERSONA_RULES:
        if any(kw in title for kw in keywords):
            return persona
    return None


# ── FIELD NORMALIZATION ──────────────────────────────────────────────────────

OWNERSHIP_MAP = {
    "private": "private",
    "public": "public",
    "pe-backed": "pe_backed",
    "pe backed": "pe_backed",
}

COUNTRY_CONTINENT = {
    "united states": "North America", "canada": "North America", "mexico": "North America",
    "united kingdom": "Europe", "germany": "Europe", "ireland": "Europe", "belgium": "Europe", "russia": "Europe",
    "india": "Asia", "japan": "Asia", "china": "Asia", "israel": "Asia", "pakistan": "Asia", "singapore": "Asia",
    "australia": "Oceania",
    "south africa": "Africa",
    "brazil": "South America",
}


def normalize_domain(website) -> str | None:
    if not website:
        return None
    domain = str(website).strip().lower()
    domain = re.sub(r"^https?://", "", domain)
    domain = re.sub(r"^www\.", "", domain)
    return domain.split("/")[0] or None


def parse_int(value) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def parse_money_in_000s(value) -> float | None:
    amount = parse_int(value)
    return amount * 1000 if amount is not None else None


def parse_date(value):
    """Parses 'January 05, 2023' style dates (funding/certification/job-start)."""
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip(), "%B %d, %Y")
    except ValueError:
        return None


def parse_iso_date(value):
    """Parses '2025-03-18T00:00:00Z' style dates (intent/scoop/news)."""
    if not value:
        return None
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return None


def company_uuid(organisation_id, zi_company_id: int) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"zoominfo-company-{organisation_id}-{zi_company_id}")


def _stable_id(*parts: str) -> str:
    joined = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(joined.encode()).hexdigest()


# ── ROW BUILDERS ──────────────────────────────────────────────────────────────

COMPANY_COLUMNS = [
    "zi_company_id", "company_id", "organisation_id", "company_name", "company_domain",
    "company_type", "company_status", "is_verified",
    "employee_count", "employee_range", "revenue_usd", "revenue_range",
    "ownership_type", "founded_year", "description", "logo_url",
    "city", "state", "country", "continent",
    "primary_industry", "industries",
    "linkedin_url", "twitter_url", "facebook_url",
    "total_funding_amount", "recent_funding_amount", "recent_funding_date",
    "company_funding", "employee_growth", "competitors",
    "technologies", "products",
]

DECISION_MAKER_COLUMNS = [
    "zi_person_id", "organisation_id", "company_id",
    "first_name", "last_name", "picture_url",
    "job_title", "department", "years_of_experience",
    "persona", "email", "phone", "mobile_phone", "linkedin_url",
]


def build_company_row(row: dict, organisation_id) -> dict:
    zi_company_id = parse_int(row["ZoomInfo Company ID"])
    country = (row.get("Company Country") or "").strip()
    ownership_type = OWNERSHIP_MAP.get((row.get("Ownership Type") or "").strip().lower())
    is_active = (row.get("Certified Active Company") or "").strip().lower() == "yes"

    recent_funding_amount = parse_money_in_000s(row.get("Recent Funding Amount (in 000s USD)"))
    recent_funding_date = parse_date(row.get("Recent Funding Date"))
    all_investors = [i.strip() for i in (row.get("All Investors") or "").split(";") if i.strip()]
    company_funding = []
    if recent_funding_amount:
        company_funding.append({
            "date": recent_funding_date.date().isoformat() if recent_funding_date else None,
            "type": row.get("Recent Funding Round") or None,
            "amount": recent_funding_amount,
            "investors": all_investors,
        })

    primary_industry = [row["Primary Industry"]] if row.get("Primary Industry") else None
    industries = [i.strip() for i in (row.get("All Industries") or "").split(";") if i.strip()] or None

    return {
        "zi_company_id": zi_company_id,
        "company_id": company_uuid(organisation_id, zi_company_id),
        "organisation_id": organisation_id,
        "company_name": row.get("Company Name") or None,
        "company_domain": normalize_domain(row.get("Website")),
        "company_type": None,
        "company_status": "ALIVE" if is_active else "OUT_OF_BUSINESS",
        "is_verified": is_active,
        "employee_count": parse_int(row.get("Employees")),
        "employee_range": row.get("Employee Range") or None,
        "revenue_usd": parse_money_in_000s(row.get("Revenue (in 000s USD)")),
        "revenue_range": row.get("Revenue Range (in USD)") or None,
        "ownership_type": ownership_type,
        "founded_year": str(row["Founded Year"]) if row.get("Founded Year") else None,
        "description": None,
        "logo_url": None,
        "city": row.get("Company City") or None,
        "state": row.get("Company State") or None,
        "country": country or None,
        "continent": COUNTRY_CONTINENT.get(country.lower()),
        "primary_industry": primary_industry,
        "industries": industries,
        "linkedin_url": row.get("LinkedIn Company Profile URL") or None,
        "twitter_url": row.get("Twitter Company Profile URL") or None,
        "facebook_url": row.get("Facebook Company Profile URL") or None,
        "total_funding_amount": parse_money_in_000s(row.get("Total Funding Amount (in 000s USD)")),
        "recent_funding_amount": recent_funding_amount,
        "recent_funding_date": recent_funding_date,
        "company_funding": company_funding,
        "employee_growth": None,
        "competitors": None,
        "technologies": None,
        "products": None,
    }


def build_decision_maker_row(row: dict, organisation_id) -> dict:
    zi_company_id = parse_int(row["ZoomInfo Company ID"])
    job_title = row.get("Job Title") or None
    return {
        "zi_person_id": parse_int(row["ZoomInfo Contact ID"]),
        "organisation_id": organisation_id,
        "company_id": company_uuid(organisation_id, zi_company_id),
        "first_name": row.get("First Name") or None,
        "last_name": row.get("Last Name") or None,
        "picture_url": None,
        "job_title": job_title,
        "department": row.get("Department") or None,
        "years_of_experience": None,
        "persona": classify_persona(job_title),
        "email": row.get("Email Address") or None,
        "phone": row.get("Direct Phone Number") or None,
        "mobile_phone": row.get("Mobile phone") or None,
        "linkedin_url": row.get("LinkedIn Contact Profile URL") or None,
    }


def build_intent_row(row: dict, organisation_id) -> dict | None:
    topic = row.get("Intent Topic")
    if not topic:
        return None
    zi_company_id = parse_int(row["ZoomInfo Company ID"])
    signal_date = parse_iso_date(row.get("Intent Signal Date"))
    return {
        "intent_id": _stable_id("intent", organisation_id, zi_company_id, topic, row.get("Intent Signal Date")),
        "company_id": company_uuid(organisation_id, zi_company_id),
        "category": row.get("Intent Category") or None,
        "topic": topic,
        "signal_score": parse_int(row.get("Intent Signal Score")),
        "signal_date": signal_date,
        "recommended_contacts": None,
    }


def build_scoop_row(row: dict, organisation_id) -> dict | None:
    scoop_id = row.get("Scoop ID")
    if not scoop_id:
        return None
    zi_company_id = parse_int(row["ZoomInfo Company ID"])
    return {
        "scoop_id": f"{organisation_id}:{scoop_id}",
        "company_id": company_uuid(organisation_id, zi_company_id),
        "description": row.get("Scoop Description") or None,
        "published_date": parse_iso_date(row.get("Scoop Published Date")),
        "topics": [{"topic": row["Scoop Topic"]}] if row.get("Scoop Topic") else None,
        "types": [{"type": row["Scoop Type"]}] if row.get("Scoop Type") else None,
    }


def build_news_row(row: dict, organisation_id) -> dict | None:
    title = row.get("News Title")
    if not title:
        return None
    zi_company_id = parse_int(row["ZoomInfo Company ID"])
    natural_key = row.get("News URL") or _stable_id("news", zi_company_id, title, row.get("News Published Date"))
    return {
        "news_id": f"{organisation_id}:{natural_key}",
        "company_id": company_uuid(organisation_id, zi_company_id),
        "domain": row.get("News Domain") or None,
        "title": title,
        "image_url": None,
        "description": row.get("News Description") or None,
        "category": row.get("News Categories") or None,
        "page_date": parse_iso_date(row.get("News Published Date")),
    }
