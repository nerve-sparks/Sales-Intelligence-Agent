"""Read-only company/decision-maker directory queries - plain org-wide
listing/lookup for pages like Enterprise List/Detail and Buying Committee.
Never scoped to an ICP - the ICP-filtering module (icp_filter.py) and its
CRUD API were removed entirely along with the ICP concept.
"""

from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, CompanyImportBatch, DecisionMaker, LeadScore

# Same tiers the Enterprise List's row badges use (frontend toEnterprise()):
# >=80 high, >=60 medium, everything else (incl. unscored/nurture) low.
HIGH_SCORE = 80
MEDIUM_SCORE = 60

HIGH_CONFIDENCE_LABEL = "High"


def _in_batch(import_batch_id: UUID):
    """Company-in-batch predicate via the permanent membership table (item 5),
    NOT Company.import_batch_id (which a later re-upload overwrites)."""
    return Company.company_id.in_(
        select(CompanyImportBatch.company_id).where(CompanyImportBatch.import_batch_id == import_batch_id)
    )


async def list_companies(
    session: AsyncSession,
    organisation_id: UUID,
    page: int,
    page_size: int,
    search: str | None = None,
    import_batch_id: UUID | None = None,
):
    stmt = (
        select(Company, LeadScore)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    if search:
        stmt = stmt.where(Company.company_name.ilike(f"%{search}%"))
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))

    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = (
        stmt.order_by(LeadScore.lead_score.desc().nulls_last(), Company.company_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(stmt)).all()
    return rows, total


async def intent_counts(
    session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None
) -> dict[str, int]:
    tier = case(
        (LeadScore.lead_score >= HIGH_SCORE, "high"),
        (LeadScore.lead_score >= MEDIUM_SCORE, "medium"),
        else_="low",
    )
    stmt = (
        select(tier.label("tier"), func.count())
        .select_from(Company)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
        .group_by(tier)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    rows = (await session.execute(stmt)).all()
    counts = {"high": 0, "medium": 0, "low": 0}
    counts.update(dict(rows))
    return counts


async def sales_status_summary(
    session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None
) -> dict:
    """Evidence-based rollup for the Dashboard/stats API (brief items 22, 29):
    total/scored/unscored, the five sales-status band counts, average lead
    score, high-confidence count, and provisional pipeline value (sum of
    expected deal values). No gates/intent tiers. Optionally batch-scoped via
    the membership table."""
    scope = [Company.organisation_id == organisation_id]
    if import_batch_id is not None:
        scope.append(_in_batch(import_batch_id))

    total = (await session.execute(select(func.count()).select_from(Company).where(*scope))).scalar_one()

    status_rows = (
        await session.execute(
            select(LeadScore.sales_status, func.count())
            .select_from(Company)
            .join(LeadScore, LeadScore.company_id == Company.company_id)
            .where(*scope, LeadScore.lead_score.isnot(None))
            .group_by(LeadScore.sales_status)
        )
    ).all()
    by_status = {status: count for status, count in status_rows}

    avg_row, value_row, total_scored = (
        await session.execute(
            select(
                func.avg(LeadScore.lead_score),
                func.sum(LeadScore.expected_deal_value_usd),
                func.count(),
            )
            .select_from(Company)
            .join(LeadScore, LeadScore.company_id == Company.company_id)
            .where(*scope, LeadScore.lead_score.isnot(None))
        )
    ).one()

    high_conf = (
        await session.execute(
            select(func.count())
            .select_from(Company)
            .join(LeadScore, LeadScore.company_id == Company.company_id)
            .where(*scope, LeadScore.confidence_label == HIGH_CONFIDENCE_LABEL)
        )
    ).scalar_one()

    scored = total_scored or 0
    return {
        "total": total or 0,
        "total_scored": scored,
        "scored": scored,
        "unscored": (total or 0) - scored,
        "sales_ready": by_status.get("Sales Ready", 0),
        "high_priority": by_status.get("High Priority", 0),
        "warm": by_status.get("Warm", 0),
        "monitor": by_status.get("Monitor", 0),
        "low_priority": by_status.get("Low Priority", 0),
        "high_confidence": high_conf or 0,
        "avg_lead_score": float(avg_row) if avg_row is not None else None,
        "pipeline_value": float(value_row) if value_row is not None else 0.0,
    }


async def lead_score_by_country(
    session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None
) -> list[tuple[str, float | None, int]]:
    """Real average LeadScore.lead_score per Company.country (unscored
    companies excluded from the average via the outer join, but still
    counted) - feeds the Dashboard globe's per-country tiering. Passing
    import_batch_id restricts to companies from one specific Excel upload
    (Dashboard timeline picker), instead of every company the org has ever
    ingested."""
    stmt = (
        select(Company.country, func.avg(LeadScore.lead_score), func.count())
        .select_from(Company)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id, Company.country.isnot(None))
        .group_by(Company.country)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    return (await session.execute(stmt)).all()


async def list_companies_for_export(
    session: AsyncSession, organisation_id: UUID, company_ids: set[UUID] | None = None
):
    """Every matching company with its full LeadScore row (not just
    lead_score/gate_status like list_companies) - feeds the Enterprise
    List's "Export" button. company_ids narrows to an ICP-filtered set when
    the page has one selected; None means every company in the org."""
    stmt = (
        select(Company, LeadScore)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    if company_ids is not None:
        stmt = stmt.where(Company.company_id.in_(company_ids))
    stmt = stmt.order_by(LeadScore.lead_score.desc().nulls_last(), Company.company_name)
    return (await session.execute(stmt)).all()


async def get_company(session: AsyncSession, organisation_id: UUID, company_id: UUID) -> Company | None:
    stmt = (
        select(Company)
        .options(selectinload(Company.decision_makers))
        .where(Company.company_id == company_id, Company.organisation_id == organisation_id)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_decision_makers(
    session: AsyncSession, organisation_id: UUID, company_id: UUID
) -> list[DecisionMaker]:
    stmt = select(DecisionMaker).where(
        DecisionMaker.company_id == company_id, DecisionMaker.organisation_id == organisation_id
    )
    return (await session.execute(stmt)).scalars().all()


async def get_decision_maker(
    session: AsyncSession, organisation_id: UUID, decision_maker_id: UUID
) -> DecisionMaker | None:
    stmt = select(DecisionMaker).where(
        DecisionMaker.decision_maker_id == decision_maker_id,
        DecisionMaker.organisation_id == organisation_id,
    )
    return (await session.execute(stmt)).scalar_one_or_none()
