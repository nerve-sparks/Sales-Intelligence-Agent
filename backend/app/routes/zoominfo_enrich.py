from fastapi import APIRouter

from app.controllers import zoominfo_enrich as zoominfo_controller

router = APIRouter(prefix="/organisations/{organisation_id}/zoominfo", tags=["zoominfo"])

router.post("/companies/enrich")(zoominfo_controller.enrich_company)
router.post("/contacts/enrich")(zoominfo_controller.enrich_contact)
router.post("/scoops/enrich")(zoominfo_controller.enrich_scoops)
router.post("/news/enrich")(zoominfo_controller.enrich_news)
router.post("/intent/enrich")(zoominfo_controller.enrich_intent)
router.post("/technologies/enrich")(zoominfo_controller.enrich_technologies)
