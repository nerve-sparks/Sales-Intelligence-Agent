"""Read-only company/decision-maker directory queries - plain org-wide
listing/lookup for pages like Enterprise List/Detail and Buying Committee.
Never scoped to an ICP - the ICP-filtering module (icp_filter.py) and its
CRUD API were removed entirely along with the ICP concept.
"""

from uuid import UUID

from sqlalchemy import case, func, or_, select
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
    session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None,
    sector: str | None = None,
) -> list[tuple[str, float | None, int, float | None]]:
    """Real average AND max LeadScore.lead_score per Company.country
    (unscored companies excluded from both via the outer join, but still
    counted) - feeds the Dashboard globe's per-country tiering. Both are
    returned deliberately: average alone hides real opportunity in any
    country with a large, mixed population (e.g. 475 US companies averaging
    ~38 despite 124 of them individually being Sales Ready/High Priority) -
    the globe colors by max (does real opportunity exist here) while the
    average stays available for the tooltip's fuller picture. Passing
    import_batch_id restricts to companies from one specific Excel upload
    (Dashboard timeline picker), instead of every company the org has ever
    ingested."""
    stmt = (
        select(Company.country, func.avg(LeadScore.lead_score), func.count(), func.max(LeadScore.lead_score))
        .select_from(Company)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id, Company.country.isnot(None))
        .group_by(Company.country)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    # Sector filter applied here rather than in the caller so the globe's
    # industry dropdown actually re-colours the map instead of only relabelling.
    sector_condition = _sector_condition(sector)
    if sector_condition is not None:
        stmt = stmt.where(sector_condition)
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


async def export_bundle(
    session: AsyncSession, organisation_id: UUID, company_ids: set[UUID] | None = None
) -> tuple[list, list, list]:
    """Everything the export workbook needs: (companies_with_scores, contacts,
    buying_events).

    Fetched as three flat queries rather than lazily per company - an export of
    2,500+ companies would otherwise fire thousands of round trips, and this
    runs inside a request that streams a file back.
    """
    from app.models import BuyingEvent  # local: avoids a circular import at module load

    companies = await list_companies_for_export(session, organisation_id, company_ids)

    contact_stmt = (
        select(DecisionMaker, Company.company_name)
        .join(Company, Company.company_id == DecisionMaker.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    event_stmt = (
        select(BuyingEvent, Company.company_name)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(Company.organisation_id == organisation_id, BuyingEvent.is_stale.is_(False))
    )
    if company_ids is not None:
        contact_stmt = contact_stmt.where(Company.company_id.in_(company_ids))
        event_stmt = event_stmt.where(Company.company_id.in_(company_ids))

    contact_stmt = contact_stmt.order_by(Company.company_name, DecisionMaker.last_name)
    event_stmt = event_stmt.order_by(Company.company_name, BuyingEvent.event_score.desc())

    contacts = (await session.execute(contact_stmt)).all()
    events = (await session.execute(event_stmt)).all()
    return companies, contacts, events


def _sector_condition(sector: str | None):
    """SQL condition restricting to one industry sector, or None for no filter.

    Translates the sector back into its member industry labels (the mapping
    lives only in industry_sectors) and matches with the array-overlap operator,
    since Company.primary_industry is TEXT[].

    "Unclassified" is a real, selectable bucket - it is where the ~2,500
    companies from spreadsheets with no industry column live, and hiding them
    behind "no filter" would make a third of the book unreachable."""
    from app.core.industry_sectors import SECTOR_INDUSTRIES, UNCLASSIFIED

    if not sector:
        return None
    if sector == UNCLASSIFIED:
        known = [i for industries in SECTOR_INDUSTRIES.values() for i in industries]
        return or_(
            Company.primary_industry.is_(None),
            ~Company.primary_industry.overlap(known),
        )
    industries = SECTOR_INDUSTRIES.get(sector)
    if not industries:
        return None
    return Company.primary_industry.overlap(list(industries))


async def sector_breakdown(
    session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None
) -> list[dict]:
    """Company + Sales-Ready counts per industry SECTOR, ordered for display.

    Rolls Company.primary_industry up through industry_sectors, because the raw
    column is too skewed to filter on directly - "Software" alone is 5,936 of
    8,101 classified companies. Aggregated in Python rather than SQL so the
    mapping lives in exactly one place (industry_sectors) instead of being
    duplicated as a CASE expression here and again in the frontend."""
    from app.core.industry_sectors import SECTOR_ORDER, sector_for_company

    stmt = (
        select(
            Company.primary_industry, Company.industries, LeadScore.sales_status,
            func.count().label("n"),
        )
        .select_from(Company)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
        .group_by(Company.primary_industry, Company.industries, LeadScore.sales_status)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))

    totals: dict[str, dict] = {}
    for primary_industry, industries, sales_status, count in (await session.execute(stmt)).all():
        sector = sector_for_company(primary_industry, industries)
        bucket = totals.setdefault(sector, {"companies": 0, "sales_ready": 0, "scored": 0})
        bucket["companies"] += count
        if sales_status:
            bucket["scored"] += count
            if sales_status == "Sales Ready":
                bucket["sales_ready"] += count

    return [
        {"sector": sector, **totals[sector]}
        for sector in SECTOR_ORDER
        if sector in totals and totals[sector]["companies"]
    ]
