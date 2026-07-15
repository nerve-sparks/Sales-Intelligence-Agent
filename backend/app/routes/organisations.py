from fastapi import APIRouter

from app.controllers import organisations as organisations_controller

router = APIRouter(prefix="/organisations", tags=["organisations"])

router.post("")(organisations_controller.create)
router.get("/{organisation_id}")(organisations_controller.get)
