from fastapi import APIRouter

from app.controllers import organisations as organisations_controller
from app.schemas.organisation import IcpRecommendationsOut, OrganisationOut

router = APIRouter(prefix="/organisations", tags=["organisations"])

router.post("", response_model=OrganisationOut)(organisations_controller.create)
router.get("/{organisation_id}", response_model=OrganisationOut)(organisations_controller.get)
router.get(
    "/{organisation_id}/icp-recommendations", response_model=IcpRecommendationsOut
)(organisations_controller.icp_recommendations)
