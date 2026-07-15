from app.models import Organisation


def serialize_organisation(org: Organisation) -> dict:
    return {
        "organisation_id": str(org.organisation_id),
        "account_name": org.account_name,
        "account_url": org.account_url,
        "account_logo_url": org.account_logo_url,
        "timezone": org.timezone,
        "currency": org.currency,
        "company_name": org.company_name,
        "website": org.website,
        "legal_business_name": org.legal_business_name,
        "industry": org.industry,
        "sub_industry": org.sub_industry,
        "headquarters_location": org.headquarters_location,
        "founded_year": org.founded_year,
        "employee_count_range": org.employee_count_range,
        "annual_revenue_range": org.annual_revenue_range,
        "business_type": org.business_type,
        "company_description": org.company_description,
        "created_at": org.created_at,
    }
