from fastapi import APIRouter

from app.controllers import uploads as uploads_controller
from app.controllers.uploads import UploadOut

router = APIRouter(prefix="/uploads", tags=["uploads"])

router.post("/logo", response_model=UploadOut)(uploads_controller.upload_logo)
