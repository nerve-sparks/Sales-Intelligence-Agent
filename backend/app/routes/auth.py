from fastapi import APIRouter

from app.controllers import auth as auth_controller
from app.schemas.auth import CurrentUserOut

router = APIRouter(prefix="/auth", tags=["auth"])

router.get("/me", response_model=CurrentUserOut)(auth_controller.me)

# Proxied to the NervesParks auth-gateway (services/auth_gateway.py). Public by
# design - these are how a caller gets a token in the first place.
router.post("/login")(auth_controller.login)
router.post("/register")(auth_controller.register)
router.post("/refresh")(auth_controller.refresh)
router.post("/logout")(auth_controller.logout)
