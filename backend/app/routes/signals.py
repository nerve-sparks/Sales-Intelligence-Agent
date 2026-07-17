from fastapi import APIRouter

from app.controllers import signals as signals_controller
from app.schemas.signal import SignalExtractResult, SignalListOut, SignalOut, SignalRescoreResult, SignalWithCompanyOut

router = APIRouter(prefix="/organisations/{organisation_id}/signals", tags=["signals"])

router.post("/extract", response_model=SignalExtractResult)(signals_controller.extract)
router.post("/rescore", response_model=SignalRescoreResult)(signals_controller.rescore)
router.get("", response_model=SignalListOut)(signals_controller.list_all)
router.get("/detail/{signal_id}", response_model=SignalWithCompanyOut)(signals_controller.get_by_id)
router.get("/{company_id}", response_model=list[SignalOut])(signals_controller.get_signals)
