from app.models import Company, CompanyIntent, DecisionMaker, IcpProfile


def serialize_icp(icp: IcpProfile) -> dict:
    return {
        "icp_id": str(icp.icp_id),
        "name": icp.name,
        "industries": icp.industries,
        "employee_min": icp.employee_min,
        "employee_max": icp.employee_max,
        "revenue_min_usd": icp.revenue_min_usd,
        "revenue_max_usd": icp.revenue_max_usd,
        "countries": icp.countries,
        "technologies": icp.technologies,
        "buying_committee_personas": icp.buying_committee_personas,
        "created_at": icp.created_at,
        "updated_at": icp.updated_at,
    }


def serialize_decision_maker(dm: DecisionMaker) -> dict:
    return {
        "zi_person_id": dm.zi_person_id,
        "first_name": dm.first_name,
        "last_name": dm.last_name,
        "job_title": dm.job_title,
        "department": dm.department,
        "persona": dm.persona,
        "email": dm.email,
        "phone": dm.phone,
        "mobile_phone": dm.mobile_phone,
        "linkedin_url": dm.linkedin_url,
    }


def serialize_intent(intent: CompanyIntent) -> dict:
    return {
        "intent_id": intent.intent_id,
        "company_id": str(intent.company_id),
        "category": intent.category,
        "topic": intent.topic,
        "signal_score": intent.signal_score,
        "signal_date": intent.signal_date,
        "recommended_contacts": intent.recommended_contacts,
    }


def serialize_company(company: Company) -> dict:
    return {
        "company_id": str(company.company_id),
        "zi_company_id": company.zi_company_id,
        "company_name": company.company_name,
        "company_domain": company.company_domain,
        "company_type": company.company_type,
        "company_status": company.company_status,
        "is_verified": company.is_verified,
        "employee_count": company.employee_count,
        "employee_range": company.employee_range,
        "revenue_usd": company.revenue_usd,
        "revenue_range": company.revenue_range,
        "ownership_type": company.ownership_type,
        "founded_year": company.founded_year,
        "description": company.description,
        "logo_url": company.logo_url,
        "city": company.city,
        "state": company.state,
        "country": company.country,
        "continent": company.continent,
        "primary_industry": company.primary_industry,
        "industries": company.industries,
        "linkedin_url": company.linkedin_url,
        "twitter_url": company.twitter_url,
        "facebook_url": company.facebook_url,
        "total_funding_amount": company.total_funding_amount,
        "recent_funding_amount": company.recent_funding_amount,
        "recent_funding_date": company.recent_funding_date,
        "company_funding": company.company_funding,
        "employee_growth": company.employee_growth,
        "competitors": company.competitors,
        "technologies": company.technologies,
        "products": company.products,
        "decision_makers": [serialize_decision_maker(dm) for dm in company.decision_makers],
    }
