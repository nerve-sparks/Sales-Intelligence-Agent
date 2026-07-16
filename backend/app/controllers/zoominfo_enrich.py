from datetime import date
from uuid import UUID

from fastapi import Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services import zoominfo_enrich
from app.services.zoominfo_client import ZoomInfoAPIError, ZoomInfoNotConfiguredError
from app.views.icp_view import serialize_company, serialize_decision_maker, serialize_intent


class CompanyMatchCriteria(BaseModel):
    """Mirrors ZoomInfo's full matchCompanyInput schema - every field here is
    an identification input for the API call, not something we store, so
    it's kept complete regardless of what the Company model persists.
    """

    company_name: str | None = None
    company_website: str | None = None
    zi_company_id: int | None = None
    company_ticker: str | None = None
    company_phone: str | None = None
    company_fax: str | None = None
    company_street: str | None = None
    company_city: str | None = None
    company_state: str | None = None
    company_zip_code: str | None = None
    company_country: str | None = None
    ip_address: str | None = None

    @model_validator(mode="after")
    def at_least_one(self):
        if not any([
            self.company_name, self.company_website, self.zi_company_id, self.company_ticker,
            self.company_phone, self.company_fax, self.company_street, self.company_city,
            self.company_state, self.company_zip_code, self.company_country, self.ip_address,
        ]):
            raise ValueError("provide at least one company match field")
        return self

    def to_zoominfo(self) -> dict:
        criteria = {}
        if self.company_name:
            criteria["companyName"] = self.company_name
        if self.company_website:
            criteria["companyWebsite"] = self.company_website
        if self.zi_company_id:
            criteria["companyId"] = self.zi_company_id
        if self.company_ticker:
            criteria["companyTicker"] = self.company_ticker
        if self.company_phone:
            criteria["companyPhone"] = self.company_phone
        if self.company_fax:
            criteria["companyFax"] = self.company_fax
        if self.company_street:
            criteria["companyStreet"] = self.company_street
        if self.company_city:
            criteria["companyCity"] = self.company_city
        if self.company_state:
            criteria["companyState"] = self.company_state
        if self.company_zip_code:
            criteria["companyZipCode"] = self.company_zip_code
        if self.company_country:
            criteria["companyCountry"] = self.company_country
        if self.ip_address:
            criteria["ipAddress"] = self.ip_address
        return criteria


class ContactMatchCriteria(BaseModel):
    """Mirrors ZoomInfo's full matchPersonInput schema - match fields are
    call-identification inputs, not stored data, so kept complete.
    company_id (ours) is separate: it's where the resulting DecisionMaker
    row attaches in our DB, never sent to ZoomInfo.
    """

    company_id: UUID
    full_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    zi_person_id: int | None = None
    hashed_email: str | None = None
    external_url: str | None = None
    last_updated_date_after: date | None = None
    valid_date_after: date | None = None
    contact_accuracy_score_min: str | None = None
    zi_company_id: int | None = None
    company_name: str | None = None

    @model_validator(mode="after")
    def at_least_one(self):
        if not any([
            self.full_name, self.first_name, self.last_name, self.email, self.phone,
            self.job_title, self.zi_person_id, self.hashed_email, self.external_url,
        ]):
            raise ValueError("provide at least one contact identification field")
        return self

    def to_zoominfo(self) -> dict:
        criteria = {}
        if self.zi_person_id:
            criteria["personId"] = self.zi_person_id
        if self.full_name:
            criteria["fullName"] = self.full_name
        if self.first_name:
            criteria["firstName"] = self.first_name
        if self.last_name:
            criteria["lastName"] = self.last_name
        if self.email:
            criteria["emailAddress"] = self.email
        if self.phone:
            criteria["phone"] = self.phone
        if self.job_title:
            criteria["jobTitle"] = self.job_title
        if self.hashed_email:
            criteria["hashedEmail"] = self.hashed_email
        if self.external_url:
            criteria["externalURL"] = self.external_url
        if self.last_updated_date_after:
            criteria["lastUpdatedDateAfter"] = self.last_updated_date_after.isoformat()
        if self.valid_date_after:
            criteria["validDateAfter"] = self.valid_date_after.isoformat()
        if self.contact_accuracy_score_min:
            criteria["contactAccuracyScoreMin"] = self.contact_accuracy_score_min
        if self.zi_company_id:
            criteria["companyId"] = self.zi_company_id
        if self.company_name:
            criteria["companyName"] = self.company_name
        return criteria


class CompanyRequest(BaseModel):
    company_id: UUID


class ScoopRequest(BaseModel):
    company_id: UUID
    published_start_date: date | None = None
    published_end_date: date | None = None
    updated_since_creation: bool | None = None
    scoop_type: str | None = None
    scoop_topic: str | None = None
    department: str | None = None
    description: str | None = None

    def to_zoominfo(self) -> dict:
        criteria = {}
        if self.published_start_date:
            criteria["publishedStartDate"] = self.published_start_date.isoformat()
        if self.published_end_date:
            criteria["publishedEndDate"] = self.published_end_date.isoformat()
        if self.updated_since_creation is not None:
            criteria["updatedSinceCreation"] = self.updated_since_creation
        if self.scoop_type:
            criteria["scoopType"] = self.scoop_type
        if self.scoop_topic:
            criteria["scoopTopic"] = self.scoop_topic
        if self.department:
            criteria["department"] = self.department
        if self.description:
            criteria["description"] = self.description
        return criteria


def _handle_zoominfo_errors(exc: Exception):
    if isinstance(exc, ZoomInfoNotConfiguredError):
        raise HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, ZoomInfoAPIError):
        raise HTTPException(status_code=502, detail=exc.detail)
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=422, detail=str(exc))
    raise exc


async def enrich_company(organisation_id: UUID, payload: CompanyMatchCriteria, db: AsyncSession = Depends(get_db)):
    try:
        company = await zoominfo_enrich.enrich_company(db, organisation_id, payload.to_zoominfo())
    except (ZoomInfoNotConfiguredError, ZoomInfoAPIError, ValueError) as exc:
        _handle_zoominfo_errors(exc)
    return serialize_company(company)


async def enrich_contact(organisation_id: UUID, payload: ContactMatchCriteria, db: AsyncSession = Depends(get_db)):
    criteria = payload.to_zoominfo()
    try:
        contact = await zoominfo_enrich.enrich_contact(db, organisation_id, criteria, payload.company_id)
    except (ZoomInfoNotConfiguredError, ZoomInfoAPIError, ValueError) as exc:
        _handle_zoominfo_errors(exc)
    return serialize_decision_maker(contact)


async def enrich_scoops(organisation_id: UUID, payload: ScoopRequest, db: AsyncSession = Depends(get_db)):
    try:
        rows = await zoominfo_enrich.enrich_scoops(db, organisation_id, payload.company_id, payload.to_zoominfo())
    except (ZoomInfoNotConfiguredError, ZoomInfoAPIError, ValueError) as exc:
        _handle_zoominfo_errors(exc)
    return {"count": len(rows), "scoops": rows}


class NewsRequest(BaseModel):
    company_id: UUID
    categories: list[str] | None = None
    url: list[str] | None = None
    page_date_min: date | None = None
    page_date_max: date | None = None

    def to_zoominfo(self) -> dict:
        criteria = {}
        if self.categories:
            criteria["categories"] = self.categories
        if self.url:
            criteria["url"] = self.url
        if self.page_date_min:
            criteria["pageDateMin"] = self.page_date_min.isoformat()
        if self.page_date_max:
            criteria["pageDateMax"] = self.page_date_max.isoformat()
        return criteria


async def enrich_news(organisation_id: UUID, payload: NewsRequest, db: AsyncSession = Depends(get_db)):
    try:
        rows = await zoominfo_enrich.enrich_news(db, organisation_id, payload.company_id, payload.to_zoominfo())
    except (ZoomInfoNotConfiguredError, ZoomInfoAPIError, ValueError) as exc:
        _handle_zoominfo_errors(exc)
    return {"count": len(rows), "news": rows}


class IntentRequest(BaseModel):
    company_id: UUID
    topics: list[str]
    signal_start_date: date | None = None
    signal_end_date: date | None = None
    signal_score_min: int | None = None
    signal_score_max: int | None = None
    audience_strength_min: str | None = None
    audience_strength_max: str | None = None
    find_recommended_contacts: bool | None = None

    @model_validator(mode="after")
    def validate_topics(self):
        if not self.topics or len(self.topics) > 50:
            raise ValueError("topics must contain between 1 and 50 items")
        return self

    def to_zoominfo(self) -> dict:
        criteria = {"topics": self.topics}
        if self.signal_start_date:
            criteria["signalStartDate"] = self.signal_start_date.isoformat()
        if self.signal_end_date:
            criteria["signalEndDate"] = self.signal_end_date.isoformat()
        if self.signal_score_min is not None:
            criteria["signalScoreMin"] = self.signal_score_min
        if self.signal_score_max is not None:
            criteria["signalScoreMax"] = self.signal_score_max
        if self.audience_strength_min:
            criteria["audienceStrengthMin"] = self.audience_strength_min
        if self.audience_strength_max:
            criteria["audienceStrengthMax"] = self.audience_strength_max
        if self.find_recommended_contacts is not None:
            criteria["findRecommendedContacts"] = self.find_recommended_contacts
        return criteria


async def enrich_intent(organisation_id: UUID, payload: IntentRequest, db: AsyncSession = Depends(get_db)):
    try:
        signals = await zoominfo_enrich.enrich_intent(db, organisation_id, payload.company_id, payload.to_zoominfo())
    except (ZoomInfoNotConfiguredError, ZoomInfoAPIError, ValueError) as exc:
        _handle_zoominfo_errors(exc)
    return {"count": len(signals), "signals": [serialize_intent(s) for s in signals]}


async def enrich_technologies(organisation_id: UUID, payload: CompanyRequest, db: AsyncSession = Depends(get_db)):
    try:
        company = await zoominfo_enrich.enrich_technologies(db, organisation_id, payload.company_id)
    except (ZoomInfoNotConfiguredError, ZoomInfoAPIError, ValueError) as exc:
        _handle_zoominfo_errors(exc)
    return serialize_company(company)
