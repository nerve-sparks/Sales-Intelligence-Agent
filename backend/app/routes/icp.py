from fastapi import APIRouter

from app.controllers import icp as icp_controller
from app.schemas.icp import IcpCompaniesOut, IcpOut

router = APIRouter(prefix="/workspaces/{workspace_id}/icp", tags=["icp"])

router.post("", response_model=IcpOut)(icp_controller.create)
router.get("/{icp_id}/companies", response_model=IcpCompaniesOut)(icp_controller.companies)
