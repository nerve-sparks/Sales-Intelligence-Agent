from fastapi import APIRouter, Depends

from app.controllers import icp_imports as icp_imports_controller
from app.core.auth import require_workspace_member
from app.schemas.icp import ImportBatchOut
from app.schemas.job import JobItemsOut, JobStatusOut, RetryFailedOut

# Active prospect-import routes (brief section 7): workspace-scoped, no ICP.
router = APIRouter(
    prefix="/workspaces/{workspace_id}/imports",
    tags=["imports"],
    dependencies=[Depends(require_workspace_member)],
)
router.post("/excel", response_model=ImportBatchOut)(icp_imports_controller.upload_prospects)
router.get("", response_model=list[ImportBatchOut])(icp_imports_controller.import_history)
# Registered after "/excel" and "" so those literal paths aren't swallowed by
# the {import_batch_id} path param.
router.get("/{import_batch_id}", response_model=JobStatusOut)(icp_imports_controller.get_status)
router.get("/{import_batch_id}/items", response_model=JobItemsOut)(icp_imports_controller.list_items)
router.post("/{import_batch_id}/retry-failed", response_model=RetryFailedOut)(icp_imports_controller.retry_failed)
router.post("/{import_batch_id}/cancel", response_model=JobStatusOut)(icp_imports_controller.cancel)
# Destructive: removes the upload AND the companies it introduced. Companies
# also present in another upload are kept - see excel_pipeline.delete_import_batch.
router.delete("/{import_batch_id}", response_model=icp_imports_controller.DeleteImportOut)(
    icp_imports_controller.delete_import
)
