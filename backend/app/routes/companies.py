from fastapi import APIRouter

from app.controllers import companies as companies_controller
from app.schemas.company import CompanyListOut, CompanyWithDecisionMakersOut, DecisionMakerOut

router = APIRouter(prefix="/organisations/{organisation_id}/companies", tags=["companies"])

router.get("", response_model=CompanyListOut)(companies_controller.list_companies)
router.get("/{company_id}", response_model=CompanyWithDecisionMakersOut)(companies_controller.get_company)
router.get("/{company_id}/decision-makers", response_model=list[DecisionMakerOut])(
    companies_controller.list_decision_makers
)

# Flat: a decision_maker_id alone is enough to resolve one contact - mirrors
# the workspaces.py members_router pattern (resource id, no parent in path).
decision_makers_router = APIRouter(
    prefix="/organisations/{organisation_id}/decision-makers", tags=["companies"]
)
decision_makers_router.get("/{decision_maker_id}", response_model=DecisionMakerOut)(
    companies_controller.get_decision_maker
)
