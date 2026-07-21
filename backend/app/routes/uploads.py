from fastapi import APIRouter, Depends

from app.core.auth import require_firebase_user
from app.controllers import uploads as uploads_controller
from app.controllers.uploads import UploadOut

# No organisation_id to check membership against - this runs during
# onboarding before an Organisation even exists (see Organization Setup's
# logo field) - just requires being logged in, same as the tenant-creation
# endpoints.
router = APIRouter(prefix="/uploads", tags=["uploads"], dependencies=[Depends(require_firebase_user)])

router.post("/logo", response_model=UploadOut)(uploads_controller.upload_logo)
