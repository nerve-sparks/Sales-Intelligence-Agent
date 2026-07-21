from fastapi import APIRouter, Depends

from app.core.auth import require_organisation_member
from app.controllers import signals as signals_controller
from app.schemas.signal import (
    SignalExtractResult,
    SignalListOut,
    SignalOut,
    SignalRescoreResult,
    SignalStatsOut,
    SignalWithCompanyOut,
)

router = APIRouter(
    prefix="/organisations/{organisation_id}/signals",
    tags=["signals"],
    dependencies=[Depends(require_organisation_member)],
)

router.post("/extract", response_model=SignalExtractResult)(signals_controller.extract)
router.post("/rescore", response_model=SignalRescoreResult)(signals_controller.rescore)
router.get("", response_model=SignalListOut)(signals_controller.list_all)
router.get("/stats", response_model=SignalStatsOut)(signals_controller.stats)
router.get("/detail/{signal_id}", response_model=SignalWithCompanyOut)(signals_controller.get_by_id)
router.get("/{company_id}", response_model=list[SignalOut])(signals_controller.get_signals)
