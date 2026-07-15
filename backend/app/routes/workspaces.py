from fastapi import APIRouter

from app.controllers import workspaces as workspaces_controller

# Nested under Organisation: creating/listing workspaces requires knowing
# which Organisation they belong to.
router = APIRouter(prefix="/organisations/{organisation_id}/workspaces", tags=["workspaces"])
router.post("")(workspaces_controller.create)
router.get("")(workspaces_controller.list_all)

# Flat: a workspace_id alone is enough to resolve its members - no need to
# also carry organisation_id in the path.
members_router = APIRouter(prefix="/workspaces/{workspace_id}/members", tags=["workspaces"])
members_router.post("")(workspaces_controller.add_workspace_member)
members_router.get("")(workspaces_controller.list_workspace_members)
