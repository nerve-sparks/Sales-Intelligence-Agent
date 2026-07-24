from fastapi import APIRouter, Depends

from app.core.auth import require_workspace_member
from app.controllers import icp_imports as icp_imports_controller
from app.schemas.icp import ImportBatchOut

router = APIRouter(
    prefix="/workspaces/{workspace_id}/icp/{icp_id}/imports",
    tags=["icp"],
    dependencies=[Depends(require_workspace_member)],
)

router.post("/excel", response_model=ImportBatchOut)(icp_imports_controller.upload_excel)
