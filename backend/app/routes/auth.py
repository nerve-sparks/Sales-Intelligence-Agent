from fastapi import APIRouter

from app.controllers import auth as auth_controller
from app.schemas.auth import CurrentUserOut

router = APIRouter(prefix="/auth", tags=["auth"])

router.get("/me", response_model=CurrentUserOut)(auth_controller.me)
