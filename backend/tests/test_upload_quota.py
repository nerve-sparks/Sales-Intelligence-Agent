"""Excel upload limit: 2 files per login account per rolling 24 hours.

Each FILE counts, uploads through any workspace count, deleting an upload does
not give the slot back, and an upload that fails does not use any quota.
"""

import asyncio
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import select
from starlette.datastructures import UploadFile

from app.controllers import icp_imports
from app.core.db import async_session_maker
from app.models import IcpImportBatch, UploadQuotaEvent
from app.services import upload_quota, user_service, workspace_service

NOW = datetime.now(timezone.utc)


@pytest.fixture
async def user(org_ctx):
    organisation_id, _workspace_id = org_ctx
    async with async_session_maker() as session:
        return await user_service.create_user(
            session, organisation_id, {"email": f"quota-{uuid.uuid4().hex[:10]}@example.com"}
        )


def _csv(name: str) -> UploadFile:
    content = f"Company Name,Website\nQuota Test {uuid.uuid4().hex[:6]},{uuid.uuid4().hex[:8]}.example.com\n"
    return UploadFile(file=io.BytesIO(content.encode()), filename=name)


async def _upload(workspace_id, user, files):
    async with async_session_maker() as session:
        return await icp_imports.upload_prospects(workspace_id, BackgroundTasks(), session, files, user)


async def test_two_files_pass_and_the_third_is_refused(org_ctx, user):
    _org, workspace_id = org_ctx
    await _upload(workspace_id, user, [_csv("a.csv")])
    await _upload(workspace_id, user, [_csv("b.csv")])

    with pytest.raises(HTTPException) as exc:
        await _upload(workspace_id, user, [_csv("c.csv")])
    assert exc.value.status_code == 429
    detail = exc.value.detail
    assert detail["used"] == 2 and detail["remaining"] == 0 and detail["next_available_at"]
    assert "limit of 2" in detail["message"]


async def test_each_file_in_one_upload_counts(org_ctx, user):
    _org, workspace_id = org_ctx
    with pytest.raises(HTTPException) as exc:
        await _upload(workspace_id, user, [_csv("a.csv"), _csv("b.csv"), _csv("c.csv")])
    assert exc.value.status_code == 429
    await _upload(workspace_id, user, [_csv("a.csv"), _csv("b.csv")])
    async with async_session_maker() as session:
        assert (await upload_quota.quota_for(session, user.user_id)).used == 2


async def test_limit_is_per_account_across_workspaces(org_ctx, user):
    organisation_id, workspace_id = org_ctx
    async with async_session_maker() as session:
        other = await workspace_service.create_workspace(session, organisation_id, {"workspace_name": "second"})
    await _upload(workspace_id, user, [_csv("a.csv")])
    await _upload(other.workspace_id, user, [_csv("b.csv")])
    with pytest.raises(HTTPException):
        await _upload(other.workspace_id, user, [_csv("c.csv")])


async def test_deleting_an_upload_does_not_free_the_slot(org_ctx, user):
    _org, workspace_id = org_ctx
    batch = await _upload(workspace_id, user, [_csv("a.csv")])
    async with async_session_maker() as session:
        await session.delete(await session.get(IcpImportBatch, batch.import_batch_id))
        await session.commit()
        assert (await upload_quota.quota_for(session, user.user_id)).used == 1


async def test_a_failed_upload_costs_no_quota(org_ctx, user, monkeypatch):
    _org, workspace_id = org_ctx

    def boom(*_a, **_k):
        raise ValueError("unreadable file")

    monkeypatch.setattr(icp_imports, "read_rows", boom)
    with pytest.raises(ValueError):
        await _upload(workspace_id, user, [_csv("broken.csv")])
    async with async_session_maker() as session:
        assert (await upload_quota.quota_for(session, user.user_id)).used == 0


async def test_window_rolls_over_after_24_hours(user):
    old = NOW - timedelta(hours=25)
    async with async_session_maker() as session:
        session.add_all([UploadQuotaEvent(user_id=user.user_id, file_name=n, created_at=old) for n in ("a", "b")])
        await session.commit()
        quota = await upload_quota.quota_for(session, user.user_id)
    assert quota.used == 0 and quota.remaining == 2 and quota.next_available_at is None


async def test_next_available_is_when_the_oldest_upload_leaves_the_window(user):
    first = NOW - timedelta(hours=20)
    async with async_session_maker() as session:
        session.add_all([
            UploadQuotaEvent(user_id=user.user_id, file_name="a", created_at=first),
            UploadQuotaEvent(user_id=user.user_id, file_name="b", created_at=NOW - timedelta(hours=1)),
        ])
        await session.commit()
        quota = await upload_quota.quota_for(session, user.user_id, NOW)
    assert quota.remaining == 0
    assert abs((quota.next_available_at - (first + timedelta(hours=24))).total_seconds()) < 1


async def test_concurrent_uploads_cannot_both_take_the_last_slot(org_ctx, user):
    _org, workspace_id = org_ctx
    await _upload(workspace_id, user, [_csv("a.csv")])

    async def attempt(name):
        async with async_session_maker() as session:
            try:
                await upload_quota.reserve(session, user.user_id, workspace_id, [name])
                await asyncio.sleep(0.2)  # hold the transaction open
                await session.commit()
                return True
            except upload_quota.UploadLimitExceeded:
                await session.rollback()
                return False

    results = await asyncio.gather(attempt("x.csv"), attempt("y.csv"))
    assert sorted(results) == [False, True]


async def test_quota_endpoint(org_ctx, user):
    _org, workspace_id = org_ctx
    await _upload(workspace_id, user, [_csv("a.csv")])
    async with async_session_maker() as session:
        out = await icp_imports.get_upload_quota(workspace_id, session, user)
        events = (await session.execute(select(UploadQuotaEvent).where(UploadQuotaEvent.user_id == user.user_id))).scalars().all()
    assert (out.limit, out.used, out.remaining) == (2, 1, 1)
    assert [e.file_name for e in events] == ["a.csv"]
