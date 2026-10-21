"""Per-account Excel upload limit: UPLOAD_LIMIT_FILES files per rolling
UPLOAD_LIMIT_WINDOW_HOURS (2 per 24h), across all of the account's workspaces.

Every uploaded FILE counts, whether several arrive in one upload or not, and
onboarding uploads count too (same endpoint). Counted from upload_quota_event,
which deleting an upload does not touch - the research spend already
happened, so deleting must not hand the slot back.
"""

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import UploadQuotaEvent


@dataclass
class Quota:
    limit: int
    used: int
    remaining: int
    window_hours: int
    next_available_at: datetime | None


class UploadLimitExceeded(Exception):
    def __init__(self, quota: Quota, requested: int):
        self.quota = quota
        self.requested = requested
        super().__init__(
            f"You've reached your limit of {quota.limit} Excel uploads in {quota.window_hours} hours."
            if quota.remaining == 0
            else f"You can upload {quota.remaining} more file{'' if quota.remaining == 1 else 's'} "
            f"in this {quota.window_hours}-hour window, but selected {requested}."
        )


async def quota_for(session: AsyncSession, user_id: UUID, now: datetime | None = None) -> Quota:
    settings = get_settings()
    now = now or datetime.now(timezone.utc)
    window_start = now - timedelta(hours=settings.upload_limit_window_hours)
    used, oldest = (
        await session.execute(
            select(func.count(), func.min(UploadQuotaEvent.created_at)).where(
                UploadQuotaEvent.user_id == user_id, UploadQuotaEvent.created_at > window_start
            )
        )
    ).one()
    limit = settings.upload_limit_files
    # The slot frees when the oldest counted upload leaves the window.
    next_available = oldest + timedelta(hours=settings.upload_limit_window_hours) if used >= limit and oldest else None
    return Quota(
        limit=limit,
        used=used,
        remaining=max(0, limit - used),
        window_hours=settings.upload_limit_window_hours,
        next_available_at=next_available,
    )


def _lock_key(user_id: UUID) -> int:
    """Stable signed 64-bit key for pg_advisory_xact_lock."""
    return int.from_bytes(hashlib.sha256(f"upload-quota:{user_id}".encode()).digest()[:8], "big", signed=True)


async def reserve(
    session: AsyncSession, user_id: UUID, workspace_id: UUID | None, file_names: list[str], now: datetime | None = None
) -> Quota:
    """Records one quota event per file, or raises UploadLimitExceeded.

    Does NOT commit: the events commit together with the upload, so an
    upload that fails afterwards (bad file, ingest error) rolls them back and
    costs no quota. The per-user advisory lock (released at transaction end)
    stops two simultaneous uploads from both passing the check."""
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _lock_key(user_id)})
    quota = await quota_for(session, user_id, now)
    if len(file_names) > quota.remaining:
        print(f"[UPLOAD-QUOTA] BLOCKED user {user_id}: tried {len(file_names)} file(s), "
              f"{quota.used}/{quota.limit} already used in the last {quota.window_hours}h"
              f"{f', next slot at {quota.next_available_at.isoformat()}' if quota.next_available_at else ''}")
        raise UploadLimitExceeded(quota, len(file_names))
    created_at = now or datetime.now(timezone.utc)
    for name in file_names:
        session.add(UploadQuotaEvent(user_id=user_id, workspace_id=workspace_id, file_name=name, created_at=created_at))
    await session.flush()
    print(f"[UPLOAD-QUOTA] Allowed user {user_id}: {', '.join(file_names) or '(unnamed)'} - "
          f"{quota.used + len(file_names)}/{quota.limit} used in the last {quota.window_hours}h")
    return quota
