import uuid
from pathlib import Path

from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel

MAX_LOGO_BYTES = 2 * 1024 * 1024  # matches the "max. 2MB" copy on the onboarding UI
ALLOWED_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/svg+xml": ".svg",
}

# backend/static/logos, served at /static/logos by the StaticFiles mount in main.py
LOGO_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "logos"


class UploadOut(BaseModel):
    url: str


async def upload_logo(file: UploadFile = File(...)) -> UploadOut:
    ext = ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(status_code=400, detail="logo must be a PNG, JPG, or SVG image")

    content = await file.read()
    if len(content) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="logo must be 2MB or smaller")

    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    (LOGO_DIR / filename).write_bytes(content)

    return UploadOut(url=f"/static/logos/{filename}")
