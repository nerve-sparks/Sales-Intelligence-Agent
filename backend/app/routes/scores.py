from fastapi import APIRouter

from app.controllers import scores as scores_controller
from app.schemas.score import LeadScoreOut, NotScoredOut, RankedLeadScoreOut, ScoreRunResult

router = APIRouter(prefix="/organisations/{organisation_id}/scores", tags=["scores"])

# /ranked must be registered before /{company_id}, otherwise the path-param
# route would match "ranked" as a company_id first.
router.post("/run", response_model=ScoreRunResult)(scores_controller.run)
router.get("/ranked", response_model=list[RankedLeadScoreOut])(scores_controller.ranked)
router.get("/{company_id}", response_model=LeadScoreOut | NotScoredOut)(scores_controller.get_score)
