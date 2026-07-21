"""Firebase Admin SDK - lazy-initialized from FIREBASE_CREDENTIALS_PATH (see
.env). The service account key itself lives outside the app/ package, in
backend/secrets/ (gitignored) - never commit it, it's full admin access to
the Firebase project.
"""

from pathlib import Path

import firebase_admin
from firebase_admin import credentials

from app.core.config import get_settings

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

_app: firebase_admin.App | None = None


class FirebaseNotConfiguredError(Exception):
    pass


def get_firebase_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app

    settings = get_settings()
    if not settings.firebase_credentials_path:
        raise FirebaseNotConfiguredError("FIREBASE_CREDENTIALS_PATH is not set in the environment")

    path = Path(settings.firebase_credentials_path)
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    if not path.exists():
        raise FirebaseNotConfiguredError(f"Firebase credentials file not found: {path}")

    cred = credentials.Certificate(str(path))
    _app = firebase_admin.initialize_app(cred)
    return _app
