from fastapi import APIRouter, Depends

from app.core.auth import require_workspace_member
from app.controllers import icp_imports as icp_imports_controller

router = APIRouter(
    prefix="/workspaces/{workspace_id}/icp/{icp_id}/imports",
    tags=["icp"],
    dependencies=[Depends(require_workspace_member)],
)

router.post("/excel")(icp_imports_controller.upload_excel)
