from fastapi import APIRouter

from app.controllers import triggers as triggers_controller

router = APIRouter(prefix="/triggers", tags=["triggers"])

router.post("")(triggers_controller.create)
router.get("/{trigger_id}/events")(triggers_controller.events)
