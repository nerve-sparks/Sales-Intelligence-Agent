from fastapi import APIRouter, Depends

from app.controllers import icp as icp_controller
from app.core.auth import require_workspace_member
from app.schemas.icp import IcpOptionsOut, IcpOut, ImportBatchOut

# ICP definitions: workspace-scoped, same tenancy guard as every other
# workspace route. Distinct from /workspaces/{id}/imports (routes/icp_imports.py),
# which is prospect-upload history and has no ICP dependency.
router = APIRouter(
    prefix="/workspaces/{workspace_id}/icp",
    tags=["icp"],
    dependencies=[Depends(require_workspace_member)],
)

router.post("", response_model=IcpOut, status_code=201)(icp_controller.create)
router.get("", response_model=list[IcpOut])(icp_controller.list_all)
# Registered before /{icp_id} so the literal "options" path isn't swallowed by
# the path param and rejected as a malformed UUID.
router.get("/options", response_model=IcpOptionsOut)(icp_controller.options)
router.get("/{icp_id}", response_model=IcpOut)(icp_controller.get_one)
router.put("/{icp_id}", response_model=IcpOut)(icp_controller.update)
router.delete("/{icp_id}", status_code=204)(icp_controller.delete)
# Discovers new companies from this ICP and hands them to the existing
# research/scoring pipeline. Returns the same ImportBatchOut an upload does, so
# the frontend polls the existing job endpoints rather than anything new.
router.post("/{icp_id}/generate", response_model=ImportBatchOut, status_code=201)(
    icp_controller.generate
)
