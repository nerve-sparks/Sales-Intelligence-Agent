from fastapi import APIRouter

from app.controllers import triggers as triggers_controller
from app.schemas.trigger import TriggerEventsOut, TriggerOut

router = APIRouter(prefix="/workspaces/{workspace_id}/triggers", tags=["triggers"])

router.post("", response_model=TriggerOut)(triggers_controller.create)
router.get("", response_model=list[TriggerOut])(triggers_controller.list_all)
router.get("/{trigger_id}/events", response_model=TriggerEventsOut)(triggers_controller.events)
