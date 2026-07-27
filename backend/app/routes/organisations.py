from fastapi import APIRouter

from app.controllers import organisations as organisations_controller
from app.schemas.organisation import OfferingProfileSyncOut, OrganisationOut

router = APIRouter(prefix="/organisations", tags=["organisations"])

router.post("", response_model=OrganisationOut)(organisations_controller.create)
router.get("/{organisation_id}", response_model=OrganisationOut)(organisations_controller.get)
router.put("/{organisation_id}", response_model=OrganisationOut)(organisations_controller.update)
router.post("/{organisation_id}/offering-profile/sync", response_model=OfferingProfileSyncOut)(
    organisations_controller.sync_offering_profile_endpoint
)
