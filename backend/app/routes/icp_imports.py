from fastapi import APIRouter

from app.controllers import icp_imports as icp_imports_controller

router = APIRouter(prefix="/workspaces/{workspace_id}/icp/{icp_id}/imports", tags=["icp"])

router.post("/excel")(icp_imports_controller.upload_excel)
