from fastapi import APIRouter

from app.controllers import icp as icp_controller
from app.schemas.icp import IcpCompaniesOut, ImportBatchOut, IcpOut

router = APIRouter(prefix="/workspaces/{workspace_id}/icp", tags=["icp"])

router.post("", response_model=IcpOut)(icp_controller.create)
router.get("", response_model=list[IcpOut])(icp_controller.list_all)
# Registered before /{icp_id}/companies so "imports" isn't swallowed as an icp_id path param.
router.get("/imports", response_model=list[ImportBatchOut])(icp_controller.import_history)
router.get("/{icp_id}/companies", response_model=IcpCompaniesOut)(icp_controller.companies)
