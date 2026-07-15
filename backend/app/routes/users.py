from fastapi import APIRouter

from app.controllers import users as users_controller

router = APIRouter(prefix="/organisations/{organisation_id}/users", tags=["users"])

router.post("")(users_controller.create)
