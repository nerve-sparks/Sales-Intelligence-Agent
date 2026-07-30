import io
import logging
from datetime import datetime, timezone
from uuid import UUID

import openpyxl
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_session_maker
from app.models import (
    BuyingEvent,
    Company,
    CompanyImportBatch,
    DecisionMaker,
    IcpImportBatch,
    LeadScore,
)
from app.services import evidence_scorer, search_signal_ingest
from app.services import zoominfo_mapper as mapper
from app.services.offering_profile_service import ensure_offering_profile

COMPANY_UPDATE_COLS = [c for c in mapper.COMPANY_COLUMNS if c not in ("zi_company_id", "company_id", "organisation_id")]
DM_UPDATE_COLS = [c for c in mapper.DECISION_MAKER_COLUMNS if c not in ("zi_person_id", "organisation_id", "company_id")]

logger = logging.getLogger(__name__)


async def _upsert_companies(session: AsyncSession, company_rows: list[dict]) -> None:
    if not company_rows:
        return
    stmt = pg_insert(Company).values(company_rows)
    update_cols = {c: getattr(stmt.excluded, c) for c in COMPANY_UPDATE_COLS}
    stmt = stmt.on_conflict_do_update(index_elements=["organisation_id", "zi_company_id"], set_=update_cols)
    await session.execute(stmt)


async def _upsert_decision_makers(session: AsyncSession, dm_rows: list[dict]) -> None:
    if not dm_rows:
        return
    stmt = pg_insert(DecisionMaker).values(dm_rows)
    update_cols = {c: getattr(stmt.excluded, c) for c in DM_UPDATE_COLS}
    stmt = stmt.on_conflict_do_update(index_elements=["organisation_id", "zi_person_id"], set_=update_cols)
    await session.execute(stmt)


async def upsert_rows(session: AsyncSession, organisation_id: UUID, raw_rows: list[dict]) -> dict[int, UUID]:
    """Parses prospect rows and upserts ONLY identity + firmographic + contact
    data (brief item 14). External buying evidence (news/scoops/intent) no
    longer comes from spreadsheet columns - it all originates through Tavily
    research into buying_event, so build_intent_row/build_scoop_row/
    build_news_row are deliberately not called here.

    Returns a {zi_company_id: company_id} map for every company referenced.
    """
    seen_companies: dict[int, dict] = {}
    seen_dms: dict[int, dict] = {}
    dm_rows_no_id: list[dict] = []
    zi_to_company_id: dict[int, UUID] = {}

    for row in raw_rows:
        zi_company_id = mapper.parse_int(row.get("ZoomInfo Company ID"))
        if not zi_company_id or not row.get("Company Name"):
            continue  # orphaned contact row with no linked company

        if zi_company_id not in seen_companies:
            company_row = mapper.build_company_row(row, organisation_id)
            seen_companies[zi_company_id] = company_row
            zi_to_company_id[zi_company_id] = company_row["company_id"]

        # Multiple uploaded files can legitimately contain the same contact -
        # a single bulk INSERT can't ON CONFLICT DO UPDATE the same
        # (organisation_id, zi_person_id) row twice, so duplicates within this
        # batch are collapsed here (last occurrence wins). Rows with no
        # zi_person_id never conflict (NULL != NULL in a unique constraint).
        dm_row = mapper.build_decision_maker_row(row, organisation_id)
        zi_person_id = dm_row["zi_person_id"]
        if zi_person_id is not None:
            seen_dms[zi_person_id] = dm_row
        else:
            dm_rows_no_id.append(dm_row)

    await _upsert_companies(session, list(seen_companies.values()))
    await _upsert_decision_makers(session, list(seen_dms.values()) + dm_rows_no_id)
    await session.commit()

    return zi_to_company_id


async def run_pipeline(
    session: AsyncSession, organisation_id: UUID, raw_rows: list[dict]
) -> dict[int, UUID]:
    """The fast, synchronous half of a prospect upload: parse + upsert
    company/contact identity data only (brief section 4). No ICP, no signals,
    no scoring - external buying evidence (Tavily research) and scoring are
    the slow parts and run afterward in the background task, so the upload
    endpoint returns immediately. Returns {zi_company_id: company_id}.
    """
    return await upsert_rows(session, organisation_id, raw_rows)


async def _company_ids_for_batch(session: AsyncSession, import_batch_id: UUID) -> list[UUID]:
    """This batch's companies via the permanent membership table (item 5) -
    never Company.import_batch_id, which a later re-upload overwrites."""
    return list(
        (
            await session.execute(
                select(CompanyImportBatch.company_id).where(
                    CompanyImportBatch.import_batch_id == import_batch_id
                )
            )
        ).scalars().all()
    )


async def _cancel_requested(session: AsyncSession, import_batch_id: UUID) -> bool:
    return (
        await session.execute(
            select(IcpImportBatch.cancel_requested_at).where(IcpImportBatch.import_batch_id == import_batch_id)
        )
    ).scalar() is not None


async def score_companies_in_background(
    organisation_id: UUID, workspace_id: UUID, import_batch_id: UUID
) -> None:
    """Runs as a FastAPI BackgroundTask after the upload response is sent (own
    DB session). Scoped to THIS upload's companies via the membership table.

    The entire pipeline is wrapped so the batch NEVER stays permanently
    'pending' (brief item 6): on success it flips to 'complete' (or
    'complete_with_warnings' if some companies' research failed), and on an
    unhandled exception it flips to 'failed' with the error recorded. Per-stage
    counts (researched / research-failures / llm-failures / scoring-failures)
    and processing timestamps are persisted for observability.

    Checks POST .../cancel's cancel_requested_at before each of the two major
    stages (research, scoring) - cooperative/best-effort: a stage already in
    flight runs to completion (its own per-company work is cheap relative to
    a 1000-company batch), but the NEXT stage is skipped once cancellation is
    seen, so a cancelled job stops making progress promptly without needing
    per-company interruption plumbed through the concurrent research/scoring
    gather calls.
    """
    started = datetime.now(timezone.utc)
    warnings: list[str] = []
    research_summary: dict = {}
    counts = {label: 0 for label in evidence_scorer.STATUS_TO_COUNT}
    status = "failed"
    error: str | None = None
    log_ctx = {"job_id": str(import_batch_id), "stage": "job"}
    logger.info("job started", extra=log_ctx)
    print(f"\n{'='*80}\n[UPLOAD] Background scoring job STARTED\n"
          f"[UPLOAD]   organisation_id = {organisation_id}\n"
          f"[UPLOAD]   workspace_id    = {workspace_id}\n"
          f"[UPLOAD]   import_batch_id = {import_batch_id}\n"
          f"[UPLOAD]   started_at      = {started.isoformat()}\n{'='*80}")

    try:
        async with async_session_maker() as session:
            company_id_list = await _company_ids_for_batch(session, import_batch_id)
            print(f"[UPLOAD] Batch resolved to {len(company_id_list)} companies "
                  f"(via permanent company_import_batch membership table)")

            if await _cancel_requested(session, import_batch_id):
                await session.execute(
                    update(IcpImportBatch)
                    .where(IcpImportBatch.import_batch_id == import_batch_id)
                    .values(
                        scoring_status="complete",
                        research_status="complete_with_warnings",
                        processing_started_at=started,
                        processing_completed_at=datetime.now(timezone.utc),
                        processing_warnings=["Cancelled before processing started."],
                    )
                )
                await session.commit()
                return

            # Ensure a real Offering Profile (auto-sync if none/stale - item 11).
            print(f"[UPLOAD] Ensuring XSparks Offering Profile is fresh (auto-syncs from "
                  f"xsparks.ai if missing/stale)...")
            await ensure_offering_profile(session, organisation_id)
            print(f"[UPLOAD] Offering Profile ready. Handing off to research_companies() "
                  f"for {len(company_id_list)} companies...")

            research_start = datetime.now(timezone.utc)
            research_summary = await search_signal_ingest.research_companies(
                session, organisation_id, company_ids=company_id_list, import_batch_id=import_batch_id,
            )
            research_elapsed = (datetime.now(timezone.utc) - research_start).total_seconds()
            print(f"\n[UPLOAD] === RESEARCH STAGE COMPLETE in {research_elapsed:.1f}s ===")
            print(f"[UPLOAD]   researched:        {research_summary.get('researched', 0)}")
            print(f"[UPLOAD]   successful:        {research_summary.get('successful', 0)}")
            print(f"[UPLOAD]   failed:            {research_summary.get('failed', 0)}")
            print(f"[UPLOAD]   research_failures: {research_summary.get('research_failures', 0)} (Tavily)")
            print(f"[UPLOAD]   llm_failures:      {research_summary.get('llm_failures', 0)}")
            print(f"[UPLOAD]   events_stored:     {research_summary.get('events_stored', 0)}\n")

            if await _cancel_requested(session, import_batch_id):
                await session.execute(
                    update(IcpImportBatch)
                    .where(IcpImportBatch.import_batch_id == import_batch_id)
                    .values(
                        scoring_status="complete",
                        research_status="complete_with_warnings",
                        companies_researched=research_summary.get("successful", 0),
                        research_failure_count=research_summary.get("research_failures", 0),
                        llm_failure_count=research_summary.get("llm_failures", 0),
                        processing_started_at=started,
                        processing_completed_at=datetime.now(timezone.utc),
                        processing_warnings=["Cancelled after research, before scoring."],
                    )
                )
                await session.commit()
                return

            print(f"[UPLOAD] Handing off to run_scoring() for {len(company_id_list)} companies...")
            scoring_start = datetime.now(timezone.utc)
            counts = await evidence_scorer.run_scoring(
                session, organisation_id, company_ids=company_id_list, import_batch_id=import_batch_id,
            )
            scoring_elapsed = (datetime.now(timezone.utc) - scoring_start).total_seconds()
            print(f"\n[UPLOAD] === SCORING STAGE COMPLETE in {scoring_elapsed:.1f}s ===")
            print(f"[UPLOAD]   Sales Ready:   {counts.get('Sales Ready', 0)}")
            print(f"[UPLOAD]   High Priority: {counts.get('High Priority', 0)}")
            print(f"[UPLOAD]   Warm:          {counts.get('Warm', 0)}")
            print(f"[UPLOAD]   Monitor:       {counts.get('Monitor', 0)}")
            print(f"[UPLOAD]   Low Priority:  {counts.get('Low Priority', 0)}\n")

            signals_extracted = (
                await session.execute(
                    select(func.count())
                    .select_from(BuyingEvent)
                    .join(CompanyImportBatch, CompanyImportBatch.company_id == BuyingEvent.company_id)
                    .where(CompanyImportBatch.import_batch_id == import_batch_id)
                )
            ).scalar() or 0

            failures = research_summary.get("failed", 0)
            if failures:
                warnings.append(f"{failures} company(ies) failed research (Tavily/LLM unavailable)")
            if research_summary.get("tavily_not_configured"):
                warnings.append("Tavily not configured - no external evidence gathered")
            status = "complete_with_warnings" if warnings else "complete"

            await session.execute(
                update(IcpImportBatch)
                .where(IcpImportBatch.import_batch_id == import_batch_id)
                .values(
                    signals_extracted=signals_extracted,
                    companies_researched=research_summary.get("successful", 0),
                    research_failure_count=research_summary.get("research_failures", 0),
                    llm_failure_count=research_summary.get("llm_failures", 0),
                    scoring_failure_count=counts.get("_failures", 0),
                    sales_ready_count=counts["Sales Ready"],
                    high_priority_count=counts["High Priority"],
                    warm_count=counts["Warm"],
                    monitor_count=counts["Monitor"],
                    low_priority_count=counts["Low Priority"],
                    scoring_status="complete",
                    research_status=status,
                    processing_started_at=started,
                    processing_completed_at=datetime.now(timezone.utc),
                    processing_warnings=warnings or None,
                )
            )
            await session.commit()
        logger.info("job finished", extra={**log_ctx, "status": status})
    except Exception as exc:  # never leave the batch permanently pending
        error = f"{type(exc).__name__}: {exc}"[:1000]
        logger.exception("job failed", extra=log_ctx)
        try:
            async with async_session_maker() as session:
                await session.execute(
                    update(IcpImportBatch)
                    .where(IcpImportBatch.import_batch_id == import_batch_id)
                    .values(
                        scoring_status="complete",
                        research_status="failed",
                        processing_started_at=started,
                        processing_completed_at=datetime.now(timezone.utc),
                        processing_error=error,
                        processing_warnings=warnings or None,
                    )
                )
                await session.commit()
        except Exception:
            pass


async def _refresh_batch_sales_status_counts(session: AsyncSession, import_batch_id: UUID) -> None:
    """Re-tallies the WHOLE batch's sales-status counts from current
    LeadScore state - used after a partial retry, since the retry only
    reprocesses the failed subset but the batch's aggregate counts should
    reflect all of its companies, not just the ones just retried."""
    company_ids_subq = select(CompanyImportBatch.company_id).where(
        CompanyImportBatch.import_batch_id == import_batch_id
    )
    rows = (
        await session.execute(select(LeadScore.sales_status).where(LeadScore.company_id.in_(company_ids_subq)))
    ).scalars().all()
    counts = {label: 0 for label in evidence_scorer.STATUS_TO_COUNT}
    for status in rows:
        if status in counts:
            counts[status] += 1
    await session.execute(
        update(IcpImportBatch)
        .where(IcpImportBatch.import_batch_id == import_batch_id)
        .values(
            sales_ready_count=counts["Sales Ready"],
            high_priority_count=counts["High Priority"],
            warm_count=counts["Warm"],
            monitor_count=counts["Monitor"],
            low_priority_count=counts["Low Priority"],
        )
    )


async def retry_failed_companies_in_background(
    organisation_id: UUID, import_batch_id: UUID, company_ids: list[UUID]
) -> None:
    """POST .../retry-failed's background work: re-runs research+scoring for
    exactly the given (previously-failed, non-permanent) companies, then
    refreshes the whole batch's aggregate sales-status counts. Companies not
    in `company_ids` are untouched - a retry never re-processes already-
    completed work (brief: idempotent, no duplicate processing)."""
    log_ctx = {"job_id": str(import_batch_id), "stage": "retry"}
    logger.info("retry started, %d companies", len(company_ids), extra=log_ctx)
    try:
        async with async_session_maker() as session:
            await ensure_offering_profile(session, organisation_id)
            await search_signal_ingest.research_companies(
                session, organisation_id, company_ids=company_ids, import_batch_id=import_batch_id,
            )
            await evidence_scorer.run_scoring(
                session, organisation_id, company_ids=company_ids, import_batch_id=import_batch_id,
            )
            await _refresh_batch_sales_status_counts(session, import_batch_id)
            await session.commit()
        logger.info("retry finished", extra=log_ctx)
    except Exception:
        logger.exception("retry failed", extra=log_ctx)


async def record_import_batch(
    session: AsyncSession,
    workspace_id: UUID,
    file_names: list[str],
    total_rows: int,
    zi_to_company_id: dict[int, UUID],
) -> IcpImportBatch:
    """Persists one prospect-upload event for the Settings prospect-data
    history (and Enterprise List's per-upload filter) - a permanent audit
    record, workspace-scoped, with NO ICP (brief section 7).

    Created with research_status='pending' and zero counts - research +
    scoring run afterward as a background task (score_companies_in_background),
    which fills the counts and flips the status. Records membership in
    company_import_batch (the permanent M:N table - brief item 5) so a later
    re-upload never erases this batch's membership, and also stamps the legacy
    Company.import_batch_id for the "most recent upload" convenience view."""
    batch = IcpImportBatch(
        workspace_id=workspace_id,
        icp_id=None,
        file_names=file_names,
        files_processed=len(file_names),
        total_rows=total_rows,
        companies_ingested=len(zi_to_company_id),
        signals_extracted=0,
        matched_icp_count=0,  # legacy column, unused by the new pipeline
        active_count=0,
        nurture_count=0,
        scoring_status="pending",
        research_status="pending",
    )
    session.add(batch)
    await session.commit()
    await session.refresh(batch)

    company_ids = list(zi_to_company_id.values())
    if company_ids:
        # Permanent membership (item 5) - one row per (company, batch), never
        # overwritten by a later upload.
        await session.execute(
            pg_insert(CompanyImportBatch)
            .values([{"company_id": cid, "import_batch_id": batch.import_batch_id} for cid in company_ids])
            .on_conflict_do_nothing(index_elements=["company_id", "import_batch_id"])
        )
        # Legacy "most recent upload" pointer, kept for convenience only.
        await session.execute(
            update(Company)
            .where(Company.company_id.in_(company_ids))
            .values(import_batch_id=batch.import_batch_id)
        )
        await session.commit()

    return batch


async def list_import_batches(session: AsyncSession, workspace_id: UUID) -> list[IcpImportBatch]:
    """Every prospect upload in this workspace, newest first. Workspace-scoped
    directly now (icp_import_batch.workspace_id) - no ICP join."""
    stmt = (
        select(IcpImportBatch)
        .where(IcpImportBatch.workspace_id == workspace_id)
        .order_by(IcpImportBatch.created_at.desc())
    )
    return (await session.execute(stmt)).scalars().all()


# Evidence-based export schema (brief section 23). No ICP/gate/D1-D7/component
# columns - those are gone from the active product.
EXPORT_COLUMNS = [
    "Company Name", "Domain", "Industry", "Location", "Employees", "Revenue",
    "Lead Score", "Sales Status", "Confidence", "Buying Evidence", "Contact Access",
    "Negative Penalty", "Best XSparks Offering", "Why Now", "Recommended Action",
    "Expected Deal Min", "Expected Deal Max", "Expected Deal Value", "Deal Value Basis",
    "Last Scored",
]


def _num(value) -> float | None:
    return float(value) if value is not None else None


def build_company_export_workbook(rows: list[tuple[Company, LeadScore | None]]) -> bytes:
    """Enterprise List "Export" - real company fields plus the evidence-based
    score (None columns for a company not yet scored)."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Companies"
    ws.append(EXPORT_COLUMNS)

    for company, score in rows:
        location = ", ".join(p for p in [company.city, company.state, company.country] if p) or None
        base = [
            company.company_name, company.company_domain,
            (company.industries or [None])[0] if company.industries else None,
            location, company.employee_count, company.revenue_usd,
        ]
        if score is None:
            score_values = [None] * (len(EXPORT_COLUMNS) - len(base))
        else:
            score_values = [
                _num(score.lead_score), score.sales_status, score.confidence_label,
                _num(score.buying_evidence_score), _num(score.contact_access_score),
                _num(score.negative_event_score), score.best_offering, score.why_now,
                score.recommended_action, _num(score.expected_deal_min_usd),
                _num(score.expected_deal_max_usd), _num(score.expected_deal_value_usd),
                score.deal_value_basis,
                score.scored_at.isoformat() if score.scored_at else None,
            ]
        ws.append(base + score_values)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
