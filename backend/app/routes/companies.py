from fastapi import APIRouter, Depends

from app.core.auth import require_organisation_member
from app.controllers import companies as companies_controller
from app.schemas.company import (
    CompanyInsightOut,
    CompanyListOut,
    CompanyStatsOut,
    CompanyWithDecisionMakersOut,
    DecisionMakerOut,
    IcpThresholdsOut,
)

router = APIRouter(
    prefix="/organisations/{organisation_id}/companies",
    tags=["companies"],
    dependencies=[Depends(require_organisation_member)],
)

router.get("", response_model=CompanyListOut)(companies_controller.list_companies)
router.get("/stats", response_model=CompanyStatsOut)(companies_controller.stats)
router.get("/icp-thresholds", response_model=IcpThresholdsOut)(companies_controller.icp_thresholds)
router.get("/insight", response_model=CompanyInsightOut)(companies_controller.insight)
router.get("/export")(companies_controller.export)
router.get("/{company_id}", response_model=CompanyWithDecisionMakersOut)(companies_controller.get_company)
router.get("/{company_id}/decision-makers", response_model=list[DecisionMakerOut])(
    companies_controller.list_decision_makers
)

# Flat: a decision_maker_id alone is enough to resolve one contact - mirrors
# the workspaces.py members_router pattern (resource id, no parent in path).
decision_makers_router = APIRouter(
    prefix="/organisations/{organisation_id}/decision-makers",
    tags=["companies"],
    dependencies=[Depends(require_organisation_member)],
)
decision_makers_router.get("/{decision_maker_id}", response_model=DecisionMakerOut)(
    companies_controller.get_decision_maker
)
