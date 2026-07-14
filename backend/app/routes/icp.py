from fastapi import APIRouter

from app.controllers import icp as icp_controller

router = APIRouter(prefix="/icp", tags=["icp"])

router.post("")(icp_controller.create)
router.get("/{icp_id}/companies")(icp_controller.companies)
