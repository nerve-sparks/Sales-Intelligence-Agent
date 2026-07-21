import io
from uuid import UUID

import openpyxl
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Company,
    CompanyIntent,
    CompanyNews,
    CompanyScoop,
    DecisionMaker,
    IcpImportBatch,
    IcpProfile,
    LeadScore,
)
from app.services import zoominfo_mapper as mapper
from app.services.icp_filter import filter_companies
from app.services.lead_scorer import run_scoring
from app.services.signal_extractor import extract_signals

COMPANY_UPDATE_COLS = [c for c in mapper.COMPANY_COLUMNS if c not in ("zi_company_id", "company_id", "organisation_id")]
DM_UPDATE_COLS = [c for c in mapper.DECISION_MAKER_COLUMNS if c not in ("zi_person_id", "organisation_id", "company_id")]


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


async def _insert_intents(session: AsyncSession, intent_rows: list[dict]) -> None:
    if not intent_rows:
        return
    stmt = pg_insert(CompanyIntent).values(intent_rows).on_conflict_do_nothing(index_elements=["intent_id"])
    await session.execute(stmt)


async def _insert_scoops(session: AsyncSession, scoop_rows: list[dict]) -> None:
    if not scoop_rows:
        return
    stmt = pg_insert(CompanyScoop).values(scoop_rows).on_conflict_do_nothing(index_elements=["scoop_id"])
    await session.execute(stmt)


async def _insert_news(session: AsyncSession, news_rows: list[dict]) -> None:
    if not news_rows:
        return
    stmt = pg_insert(CompanyNews).values(news_rows).on_conflict_do_nothing(index_elements=["news_id"])
    await session.execute(stmt)


async def upsert_rows(session: AsyncSession, organisation_id: UUID, raw_rows: list[dict]) -> dict[int, UUID]:
    """Parses raw ZoomInfo rows and upserts company/decision_maker/intent/scoop/news.

    Returns a {zi_company_id: company_id} map for every company referenced,
    so the caller can re-attach scores back onto the original uploaded rows.
    """
    seen_companies: dict[int, dict] = {}
    seen_dms: dict[int, dict] = {}
    dm_rows_no_id: list[dict] = []
    seen_intents: dict[str, dict] = {}
    seen_scoops: dict[str, dict] = {}
    seen_news: dict[str, dict] = {}
    zi_to_company_id: dict[int, UUID] = {}

    for row in raw_rows:
        zi_company_id = mapper.parse_int(row.get("ZoomInfo Company ID"))
        if not zi_company_id or not row.get("Company Name"):
            continue  # orphaned contact row with no linked company

        if zi_company_id not in seen_companies:
            company_row = mapper.build_company_row(row, organisation_id)
            seen_companies[zi_company_id] = company_row
            zi_to_company_id[zi_company_id] = company_row["company_id"]

        # Multiple uploaded files can legitimately contain the same contact
        # (e.g. overlapping company lists) - a single bulk INSERT can't
        # ON CONFLICT DO UPDATE the same (organisation_id, zi_person_id) row
        # twice, so duplicates within this batch are collapsed here (last
        # occurrence wins), same as seen_companies/seen_intents/etc below.
        # Rows with no zi_person_id never conflict (NULL != NULL in a unique
        # constraint), so those are kept as-is.
        dm_row = mapper.build_decision_maker_row(row, organisation_id)
        zi_person_id = dm_row["zi_person_id"]
        if zi_person_id is not None:
            seen_dms[zi_person_id] = dm_row
        else:
            dm_rows_no_id.append(dm_row)

        intent_row = mapper.build_intent_row(row, organisation_id)
        if intent_row:
            seen_intents[intent_row["intent_id"]] = intent_row

        scoop_row = mapper.build_scoop_row(row, organisation_id)
        if scoop_row:
            seen_scoops[scoop_row["scoop_id"]] = scoop_row

        news_row = mapper.build_news_row(row, organisation_id)
        if news_row:
            seen_news[news_row["news_id"]] = news_row

    await _upsert_companies(session, list(seen_companies.values()))
    await _upsert_decision_makers(session, list(seen_dms.values()) + dm_rows_no_id)
    await _insert_intents(session, list(seen_intents.values()))
    await _insert_scoops(session, list
    (seen_scoops.values()))
    await _insert_news(session, list(seen_news.values()))
    await session.commit()

    return zi_to_company_id


async def run_pipeline(
    session: AsyncSession, organisation_id: UUID, raw_rows: list[dict], icp: IcpProfile
) -> tuple[dict[int, UUID], dict, dict, set[UUID]]:
    """Full pipeline: upsert data, extract signals (org-wide), score only
    the companies matching the given ICP - the ICP is the actual target
    list for this upload, not every company that happened to be in the
    file. Signal extraction stays org-wide since it's just recording facts
    about companies, not a judgment call the ICP should gate.

    Returns (zi_to_company_id, signal_result, score_result, matching_ids)
    so callers (the Excel import endpoint) can report real ingestion
    numbers and reuse matching_ids for the "Matches ICP" export column
    without re-querying it - signal_result is {"inserted", "skipped"} from
    extract_signals, score_result is {"active", "nurture"} from run_scoring
    (counts only cover the ICP-matched companies that were actually scored).
    """
    zi_to_company_id = await upsert_rows(session, organisation_id, raw_rows)
    signal_result = await extract_signals(session, organisation_id)
    matches = await filter_companies(session, icp)
    matching_ids = {c.company_id for c in matches}
    score_result = await run_scoring(session, organisation_id, company_ids=matching_ids)
    return zi_to_company_id, signal_result, score_result, matching_ids


async def matching_company_ids(session: AsyncSession, icp: IcpProfile) -> set[UUID]:
    matches = await filter_companies(session, icp)
    return {c.company_id for c in matches}


async def scores_for_companies(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, LeadScore]:
    if not company_ids:
        return {}
    stmt = select(LeadScore).where(LeadScore.company_id.in_(company_ids))
    rows = (await session.execute(stmt)).scalars().all()
    return {row.company_id: row for row in rows}


SCORE_COLUMNS = [
    "Matches ICP",
    "Gate Status",
    "Gate 1 (AI Intent)",
    "Gate 2 (Reachable)",
    "Gate 3 (Economic Capacity)",
    "Gate 4 (Active Signal)",
    "Gate 5 (Recency)",
    "Component Score",
    "P(Convert)",
    "Expected Deal Value (USD)",
    "Lead Score",
]


def build_scored_workbook(
    raw_rows: list[dict],
    zi_to_company_id: dict[int, UUID],
    scores: dict[UUID, LeadScore],
    matching_ids: set[UUID],
) -> bytes:
    """Returns the uploaded rows with score columns appended, as raw .xlsx
    bytes ready to stream back for download. Every row is still scored
    regardless of ICP match (see run_scoring - scoring has no ICP
    dependency), but the ICP is the actual target list a user is asking
    for, so the output is ordered ICP matches first (ranked by lead_score
    within that group), then non-matches after (also ranked by
    lead_score) - not left in raw upload order.
    """
    if not raw_rows:
        header = []
    else:
        header = list(raw_rows[0].keys())

    scored_rows: list[tuple[bool, float | None, list]] = []
    for row in raw_rows:
        zi_company_id = mapper.parse_int(row.get("ZoomInfo Company ID"))
        company_id = zi_to_company_id.get(zi_company_id)
        score = scores.get(company_id) if company_id else None
        matches_icp = company_id in matching_ids if company_id else False

        base_values = [row.get(col) for col in header]
        if score is None:
            lead_score_value = None
            score_values = [matches_icp, "not scored"] + [None] * 9
        else:
            lead_score_value = float(score.lead_score) if score.lead_score is not None else None
            score_values = [
                matches_icp,
                score.gate_status,
                score.gate_check_1,
                score.gate_check_2,
                score.gate_check_3,
                score.gate_check_4,
                score.gate_check_5,
                float(score.component_score) if score.component_score is not None else None,
                float(score.p_convert) if score.p_convert is not None else None,
                float(score.expected_deal_value_usd) if score.expected_deal_value_usd is not None else None,
                lead_score_value,
            ]
        scored_rows.append((matches_icp, lead_score_value, base_values + score_values))

    # ICP matches first; unscored rows (lead_score_value None) sort to the
    # bottom of their group instead of breaking the sort.
    scored_rows.sort(key=lambda r: (not r[0], -(r[1] if r[1] is not None else float("-inf"))))

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Scored Companies"
    ws.append(header + SCORE_COLUMNS)
    for _, _, full_row in scored_rows:
        ws.append(full_row)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


async def record_import_batch(
    session: AsyncSession,
    icp_id: UUID,
    file_names: list[str],
    total_rows: int,
    zi_to_company_id: dict[int, UUID],
    signal_result: dict,
    matching_ids: set[UUID],
    score_result: dict,
) -> IcpImportBatch:
    """Persists one upload event for the Settings > ICP Data page's history
    list - a permanent audit record, separate from Company/Signal/LeadScore
    which store the *result* of uploads, not that an upload happened."""
    batch = IcpImportBatch(
        icp_id=icp_id,
        file_names=file_names,
        files_processed=len(file_names),
        total_rows=total_rows,
        companies_ingested=len(zi_to_company_id),
        signals_extracted=signal_result["inserted"],
        matched_icp_count=len(matching_ids),
        active_count=score_result["active"],
        nurture_count=score_result["nurture"],
    )
    session.add(batch)
    await session.commit()
    await session.refresh(batch)
    return batch


async def list_import_batches(session: AsyncSession, workspace_id: UUID) -> list[tuple[IcpImportBatch, str | None]]:
    """Every upload ever made against any ICP in this workspace, newest
    first, paired with that ICP's name (joined in, not a column on the
    batch itself - an ICP can be renamed/reused after the fact)."""
    stmt = (
        select(IcpImportBatch, IcpProfile.name)
        .join(IcpProfile, IcpProfile.icp_id == IcpImportBatch.icp_id)
        .where(IcpProfile.workspace_id == workspace_id)
        .order_by(IcpImportBatch.created_at.desc())
    )
    return (await session.execute(stmt)).all()


EXPORT_COMPANY_COLUMNS = [
    "Company Name",
    "Domain",
    "Industry",
    "City",
    "State",
    "Country",
    "Employees",
    "Revenue (USD)",
]


def build_company_export_workbook(rows: list[tuple[Company, LeadScore | None]]) -> bytes:
    """Company Directory export for the Enterprise List's "Export" button -
    real company fields plus whatever scoring exists (score is None for a
    company that hasn't been through run_scoring yet)."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Companies"
    ws.append(EXPORT_COMPANY_COLUMNS + SCORE_COLUMNS[1:])  # drop "Matches ICP" - no ICP context on a bare row

    for company, score in rows:
        base_values = [
            company.company_name,
            company.company_domain,
            (company.industries or [None])[0],
            company.city,
            company.state,
            company.country,
            company.employee_count,
            company.revenue_usd,
        ]
        if score is None:
            score_values = ["not scored"] + [None] * 9
        else:
            score_values = [
                score.gate_status,
                score.gate_check_1,
                score.gate_check_2,
                score.gate_check_3,
                score.gate_check_4,
                score.gate_check_5,
                float(score.component_score) if score.component_score is not None else None,
                float(score.p_convert) if score.p_convert is not None else None,
                float(score.expected_deal_value_usd) if score.expected_deal_value_usd is not None else None,
                float(score.lead_score) if score.lead_score is not None else None,
            ]
        ws.append(base_values + score_values)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
