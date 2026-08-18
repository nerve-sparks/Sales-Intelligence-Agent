"""Orchestrates the live buying-evidence research for a set of companies:
runs Tavily research + LLM event extraction + canonical dedup per company
(buying_event_service), each company as its own concurrent task.

Replaces the old CompanyNews/Signal ingestion in the active pipeline - all
external buying evidence now flows into buying_event (brief sections 8, 9).

Research is scoped to an explicit company_id list (the current upload's
companies - brief section 8), never the whole organisation. A refresh window
(RESEARCH_REFRESH_DAYS) means a company is re-researched only when its last
search is stale, rather than every scoring run - Company.search_signals_fetched_at
records when it last ran (set whether or not events were found, so a
genuinely-quiet company isn't re-billed every time).

import_batch_id (optional) drives per-company status tracking on
company_import_batch for GET .../imports/{id}/items and POST .../retry-failed
- see company_batch_status.py. It's None for callers not tied to one specific
upload's job (e.g. a standalone re-research), in which case those writes are
skipped entirely.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import Company, Organisation
from app.services import buying_event_service, company_batch_status, you_client
from app.services.offering_profile_service import profile_for_scoring

RESEARCH_REFRESH_DAYS = 10  # reuse research newer than this; refresh older (brief section 9)

# Bounded in-task retry for transient per-company research failures (Tavily/
# LLM temporarily unavailable) - short exponential backoff, not the long
# multi-minute kind, since a retry sleep holds this company's concurrency
# slot. A company still failing after these retries is left 'failed' for the
# user to retry explicitly (POST .../retry-failed) or picked up automatically
# next research pass (RESEARCH_REFRESH_DAYS) rather than blocking the batch.
TRANSIENT_RETRY_BACKOFF_SECONDS = (2, 4)

logger = logging.getLogger(__name__)


async def _process_company(
    company_row, offering_profile: dict, now: datetime, research_run_id, import_batch_id=None, organisation_id=None,
) -> dict:
    """One company's full research pipeline in its own session, so companies
    commit independently and progress is visible mid-run. Returns a per-company
    outcome dict. search_signals_fetched_at is stamped ONLY when research
    genuinely succeeded (item 7) - never on Tavily/LLM failure, so a failed
    company is retried next run instead of being permanently recorded as
    'researched, no evidence'."""
    company_id = company_row.company_id
    company = {
        "company_id": company_id,
        "company_name": company_row.company_name,
        "company_domain": company_row.company_domain,
        "industry": (company_row.industries or [None])[0] if company_row.industries else None,
        # Carried through to buying_event_service's LLM calls for Langfuse
        # per-tenant cost attribution (langfuse_user_id) - not a company
        # attribute, just riding along on the dict that's already threaded
        # all the way down to _classify_chunk.
        "organisation_id": organisation_id,
    }

    attempts = (len(TRANSIENT_RETRY_BACKOFF_SECONDS) + 1)
    last_summary: dict | None = None
    for attempt in range(attempts):
        try:
            async with async_session_maker() as session:
                summary = await buying_event_service.research_company(
                    session, company, offering_profile, now, research_run_id
                )
                if summary["ok"]:
                    await session.execute(
                        update(Company)
                        .where(Company.company_id == company_id)
                        .values(search_signals_fetched_at=func.now())
                    )
                    # Hands off to the scoring stage - evidence_scorer only
                    # flips this to 'completed' once it actually scores it.
                    await company_batch_status.mark_stage(session, company_id, import_batch_id, "scoring")
                await session.commit()
            last_summary = summary
        except Exception as exc:
            last_summary = {
                "ok": False, "events_stored": 0, "research_failed": True, "llm_failed": False, "partial_llm_failure": False,
            }
            logger.exception(
                "company research raised: %s",
                exc,
                extra={"company_id": str(company_id), "job_id": str(import_batch_id) if import_batch_id else "-", "stage": "research"},
            )

        if last_summary["ok"]:
            return {
                "ok": True,
                "events_stored": last_summary["events_stored"],
                "research_failed": last_summary["research_failed"],
                "llm_failed": last_summary["llm_failed"],
                "partial_llm_failure": last_summary["partial_llm_failure"],
            }

        if attempt < len(TRANSIENT_RETRY_BACKOFF_SECONDS):
            async with async_session_maker() as session:
                await company_batch_status.mark_stage(session, company_id, import_batch_id, "retrying")
                await session.commit()
            await asyncio.sleep(TRANSIENT_RETRY_BACKOFF_SECONDS[attempt])

    error = "Tavily unavailable" if last_summary and last_summary.get("research_failed") else "LLM unavailable or returned no usable result"
    async with async_session_maker() as session:
        await company_batch_status.mark_failed(session, company_id, import_batch_id, error, permanent=False)
        await session.commit()
    logger.warning(
        "company research failed after retries: %s",
        error,
        extra={"company_id": str(company_id), "job_id": str(import_batch_id) if import_batch_id else "-", "stage": "research"},
    )
    return {
        "ok": False,
        "events_stored": 0,
        "research_failed": last_summary["research_failed"] if last_summary else True,
        "llm_failed": last_summary["llm_failed"] if last_summary else False,
        "partial_llm_failure": last_summary["partial_llm_failure"] if last_summary else False,
    }


async def research_companies(
    session: AsyncSession, organisation_id, company_ids=None, force_refresh: bool = False, import_batch_id=None,
) -> dict:
    """Researches the given companies (or all in the org) whose research is
    missing or stale. Each company runs concurrently up to
    settings.research_concurrency (RESEARCH_CONCURRENCY env var - see
    config.py). Returns a rich summary (item 7) distinguishing successes from
    search/LLM failures so the caller can set complete vs complete_with_warnings."""
    if not you_client.is_configured():
        return {
            "researched": 0, "successful": 0, "failed": 0, "research_failures": 0,
            "llm_failures": 0, "events_stored": 0, "search_not_configured": True,
        }

    org = await session.get(Organisation, organisation_id)
    offering_profile = profile_for_scoring(org)
    now = datetime.now(timezone.utc)
    research_run_id = uuid.uuid4()
    stale_before = now - timedelta(days=RESEARCH_REFRESH_DAYS)

    stmt = select(
        Company.company_id, Company.company_name, Company.company_domain, Company.industries
    ).where(
        Company.organisation_id == organisation_id,
        Company.company_domain.isnot(None),
    )
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    if not force_refresh:
        stmt = stmt.where(
            (Company.search_signals_fetched_at.is_(None))
            | (Company.search_signals_fetched_at < stale_before)
        )
    targets = (await session.execute(stmt)).all()

    if company_ids is not None and import_batch_id is not None:
        await company_batch_status.mark_bulk_stage(
            session, list(company_ids), import_batch_id, "researching", stamp_started=True
        )

        # Companies with no domain can never be researched - a permanent
        # validation failure (brief: never retry these). The targets query
        # above already excludes them via company_domain.isnot(None), so
        # they need to be identified and flagged separately here rather than
        # silently falling into "skipped as already fresh" below.
        no_domain_ids = (
            await session.execute(
                select(Company.company_id).where(
                    Company.company_id.in_(company_ids), Company.company_domain.is_(None),
                )
            )
        ).scalars().all()
        for company_id in no_domain_ids:
            await company_batch_status.mark_failed(
                session, company_id, import_batch_id, "No company domain to research.", permanent=True,
            )
        if no_domain_ids:
            logger.warning(
                "%d company(ies) skipped: no domain",
                len(no_domain_ids),
                extra={"job_id": str(import_batch_id), "stage": "research"},
            )

        # Companies in scope but skipped this pass (already fresh, and not
        # missing a domain) go straight to 'scoring' - they still get a fresh
        # Lead Score from their existing evidence, just no new Tavily/LLM call.
        target_ids = {row.company_id for row in targets}
        no_domain_id_set = set(no_domain_ids)
        skipped_ids = [cid for cid in company_ids if cid not in target_ids and cid not in no_domain_id_set]
        await company_batch_status.mark_bulk_stage(session, skipped_ids, import_batch_id, "scoring")
        await session.commit()

    if not targets:
        return {"researched": 0, "successful": 0, "failed": 0, "research_failures": 0, "llm_failures": 0, "events_stored": 0}

    semaphore = asyncio.Semaphore(get_settings().research_concurrency)

    async def _bounded(row):
        async with semaphore:
            return await _process_company(row, offering_profile, now, research_run_id, import_batch_id, organisation_id)

    results = await asyncio.gather(*[_bounded(row) for row in targets])
    successful = sum(1 for r in results if r["ok"])
    return {
        "researched": len(results),
        "successful": successful,
        "failed": len(results) - successful,
        "research_failures": sum(1 for r in results if r["research_failed"]),
        "llm_failures": sum(1 for r in results if r["llm_failed"] or r["partial_llm_failure"]),
        "events_stored": sum(r["events_stored"] for r in results),
    }
