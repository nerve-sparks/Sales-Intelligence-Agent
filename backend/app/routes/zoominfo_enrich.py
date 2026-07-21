from fastapi import APIRouter, Depends

from app.core.auth import require_organisation_member
from app.controllers import zoominfo_enrich as zoominfo_controller
from app.schemas.company import CompanyOut, DecisionMakerOut, IntentEnrichOut, NewsEnrichOut, ScoopEnrichOut

router = APIRouter(
    prefix="/organisations/{organisation_id}/zoominfo",
    tags=["zoominfo"],
    dependencies=[Depends(require_organisation_member)],
)

router.post("/companies/enrich", response_model=CompanyOut)(zoominfo_controller.enrich_company)
router.post("/contacts/enrich", response_model=DecisionMakerOut)(zoominfo_controller.enrich_contact)
router.post("/scoops/enrich", response_model=ScoopEnrichOut)(zoominfo_controller.enrich_scoops)
router.post("/news/enrich", response_model=NewsEnrichOut)(zoominfo_controller.enrich_news)
router.post("/intent/enrich", response_model=IntentEnrichOut)(zoominfo_controller.enrich_intent)
router.post("/technologies/enrich", response_model=CompanyOut)(zoominfo_controller.enrich_technologies)
