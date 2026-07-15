from fastapi import APIRouter

from app.controllers import scores as scores_controller

router = APIRouter(prefix="/organisations/{organisation_id}/scores", tags=["scores"])

# /ranked must be registered before /{company_id}, otherwise the path-param
# route would match "ranked" as a company_id first.
router.post("/run")(scores_controller.run)
router.get("/ranked")(scores_controller.ranked)
router.get("/{company_id}")(scores_controller.get_score)
