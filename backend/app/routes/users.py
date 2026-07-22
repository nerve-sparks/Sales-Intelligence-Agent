from fastapi import APIRouter

from app.controllers import users as users_controller
from app.schemas.user import UserOut

router = APIRouter(prefix="/organisations/{organisation_id}/users", tags=["users"])

router.post("", response_model=UserOut)(users_controller.create)
router.put("/{user_id}", response_model=UserOut)(users_controller.update)
