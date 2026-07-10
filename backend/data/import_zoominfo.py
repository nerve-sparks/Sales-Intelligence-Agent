"""
SIGNAL - ZoomInfo CSV Import Script
Reads a ZoomInfo contact+company export CSV (one row per contact, with
company columns repeated) and upserts into:
  - company
  - decision_maker

Notes on fields not present in this export (left NULL): company_type,
description, logo_url, employee_growth, competitors, technologies, products.
company_status/is_verified are derived from "Certified Active Company" since
this export has no direct equivalent.

Usage:
    python import_zoominfo.py "data/Software PA Firms.csv"

Config:
    Reads DATABASE_URL from backend/.env directly (self-contained,
    does not import the app package so it can be run from any cwd).
"""

import csv
import json
import os
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")


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
    title = job_title.lower()
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


def normalize_domain(website: str | None) -> str | None:
    if not website:
        return None
    domain = website.strip().lower()
    domain = re.sub(r"^https?://", "", domain)
    domain = re.sub(r"^www\.", "", domain)
    return domain.split("/")[0] or None


def parse_int(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def parse_money_in_000s(value: str | None) -> float | None:
    amount = parse_int(value)
    return amount * 1000 if amount is not None else None


def parse_date(value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%B %d, %Y")
    except ValueError:
        return None


def company_uuid(zi_company_id: int) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"zoominfo-company-{zi_company_id}"))


# ── CSV ROW -> DB ROW ─────────────────────────────────────────────────────────

COMPANY_COLUMNS = [
    "zi_company_id", "company_id", "company_name", "company_domain",
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
    "zi_person_id", "company_id",
    "first_name", "last_name", "picture_url",
    "job_title", "department", "years_of_experience",
    "persona", "email", "phone", "mobile_phone", "linkedin_url",
]


def build_company_row(row: dict) -> dict:
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
        "company_id": company_uuid(zi_company_id),
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
        "founded_year": row.get("Founded Year") or None,
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
        "company_funding": json.dumps(company_funding),
        "employee_growth": None,
        "competitors": None,
        "technologies": None,
        "products": None,
    }


def build_decision_maker_row(row: dict) -> dict:
    zi_company_id = parse_int(row["ZoomInfo Company ID"])
    job_title = row.get("Job Title") or None
    return {
        "zi_person_id": parse_int(row["ZoomInfo Contact ID"]),
        "company_id": company_uuid(zi_company_id),
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


# ── DB WRITES ─────────────────────────────────────────────────────────────────

def insert_companies(cur, rows: list[dict]) -> None:
    cols = COMPANY_COLUMNS
    placeholders = ", ".join(["%s"] * len(cols))
    update_cols = [c for c in cols if c not in ("zi_company_id", "company_id")]
    update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)

    sql = f"""
        INSERT INTO company ({", ".join(cols)})
        VALUES ({placeholders})
        ON CONFLICT (zi_company_id) DO UPDATE SET {update_clause}
    """
    values = [tuple(r[c] for c in cols) for r in rows]
    cur.executemany(sql, values)


def insert_decision_makers(cur, rows: list[dict]) -> None:
    cols = DECISION_MAKER_COLUMNS
    placeholders = ", ".join(["%s"] * len(cols))
    update_cols = [c for c in cols if c not in ("zi_person_id", "company_id")]
    update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)

    sql = f"""
        INSERT INTO decision_maker ({", ".join(cols)})
        VALUES ({placeholders})
        ON CONFLICT (zi_person_id) DO UPDATE SET {update_clause}
    """
    values = [tuple(r[c] for c in cols) for r in rows]
    cur.executemany(sql, values)


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python import_zoominfo.py <path-to-csv>")
        sys.exit(1)

    csv_path = Path(sys.argv[1])
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        all_rows = list(csv.DictReader(f))

    rows = [r for r in all_rows if r.get("ZoomInfo Company ID") not in (None, "", "0") and r.get("Company Name")]
    skipped = len(all_rows) - len(rows)

    print(f"Read {len(all_rows)} contact rows from {csv_path.name} ({skipped} skipped: no linked company)")

    seen_companies: dict[str, dict] = {}
    for row in rows:
        zi_company_id = row["ZoomInfo Company ID"]
        if zi_company_id not in seen_companies:
            seen_companies[zi_company_id] = build_company_row(row)

    company_rows = list(seen_companies.values())
    decision_maker_rows = [build_decision_maker_row(r) for r in rows]

    dsn = DATABASE_URL
    for scheme in ("+asyncpg", "+psycopg"):
        dsn = dsn.replace(f"postgresql{scheme}://", "postgresql://")

    print("Connecting to database...")
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            insert_companies(cur, company_rows)
            print(f"  Upserted {len(company_rows)} companies")
            insert_decision_makers(cur, decision_maker_rows)
            print(f"  Upserted {len(decision_maker_rows)} decision makers")

    print("Done.")


if __name__ == "__main__":
    main()
