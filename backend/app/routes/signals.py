from fastapi import APIRouter

from app.controllers import signals as signals_controller

router = APIRouter(prefix="/signals", tags=["signals"])

router.post("/extract")(signals_controller.extract)
router.post("/rescore")(signals_controller.rescore)
router.get("/{company_id}")(signals_controller.get_signals)
