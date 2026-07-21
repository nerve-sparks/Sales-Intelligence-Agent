from fastapi import APIRouter, Depends

from app.core.auth import require_workspace_member
from app.controllers import triggers as triggers_controller
from app.schemas.trigger import TriggerEventsOut, TriggerInsightOut, TriggerOut

router = APIRouter(
    prefix="/workspaces/{workspace_id}/triggers",
    tags=["triggers"],
    dependencies=[Depends(require_workspace_member)],
)

router.post("", response_model=TriggerOut)(triggers_controller.create)
router.get("", response_model=list[TriggerOut])(triggers_controller.list_all)
router.get("/insight", response_model=TriggerInsightOut)(triggers_controller.insight)
router.get("/{trigger_id}/events", response_model=TriggerEventsOut)(triggers_controller.events)
