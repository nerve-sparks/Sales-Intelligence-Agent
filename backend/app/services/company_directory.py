"""Read-only company/decision-maker directory queries - not scoped to an
ICP's filter criteria (see icp_filter.py for that), just plain org-wide
listing/lookup for pages like Enterprise List/Detail and Buying Committee.
"""

from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Company, DecisionMaker, LeadScore

# Same tiers the Enterprise List's row badges use (frontend toEnterprise()):
# >=80 high, >=60 medium, everything else (incl. unscored/nurture) low.
HIGH_SCORE = 80
MEDIUM_SCORE = 60


async def list_companies(
    session: AsyncSession, organisation_id: UUID, page: int, page_size: int, search: str | None = None
):
    stmt = (
        select(Company, LeadScore.lead_score, LeadScore.gate_status)
        .outerjoin(LeadScore, LeadScore.company_id == Company.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    if search:
        stmt = stmt.where(Company.company_name.ilike(f"%{search}%"))

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
        stmt = stmt.where(Company.import_batch_id == import_batch_id)
    rows = (await session.execute(stmt)).all()
    counts = {"high": 0, "medium": 0, "low": 0}
    counts.update(dict(rows))
    return counts


async def icp_thresholds(session: AsyncSession, organisation_id: UUID) -> dict:
    """Suggests ICP ranges from the org's real uploaded companies: 10th-90th
    percentile of employee_count/revenue_usd (a populated-but-targeted band,
    not min/max which would just match everything), plus the most common
    industries and countries. Feeds the Settings ICP form's "fill from
    uploaded data" so a new ICP fits the data instead of guessed numbers."""
    org = Company.organisation_id == organisation_id

    emp = (
        await session.execute(
            select(
                func.percentile_cont(0.1).within_group(Company.employee_count),
                func.percentile_cont(0.9).within_group(Company.employee_count),
            ).where(org, Company.employee_count.isnot(None))
        )
    ).first()
    rev = (
        await session.execute(
            select(
                func.percentile_cont(0.1).within_group(Company.revenue_usd),
                func.percentile_cont(0.9).within_group(Company.revenue_usd),
            ).where(org, Company.revenue_usd.isnot(None))
        )
    ).first()

    # Unnest via a subquery so the GROUP BY is over the exploded values.
    industry_sub = (
        select(func.unnest(Company.industries).label("industry"))
        .where(org, Company.industries.isnot(None))
        .subquery()
    )
    industries = [
        r[0]
        for r in (
            await session.execute(
                select(industry_sub.c.industry)
                .group_by(industry_sub.c.industry)
                .order_by(func.count().desc())
                .limit(3)
            )
        ).all()
    ]

    countries = [
        r[0]
        for r in (
            await session.execute(
                select(Company.country)
                .where(org, Company.country.isnot(None))
                .group_by(Company.country)
                .order_by(func.count().desc())
                .limit(3)
            )
        ).all()
    ]

    count = (await session.execute(select(func.count()).select_from(Company).where(org))).scalar_one()

    return {
        "employee_min": int(emp[0]) if emp and emp[0] is not None else None,
        "employee_max": int(emp[1]) if emp and emp[1] is not None else None,
        "revenue_min_usd": int(rev[0]) if rev and rev[0] is not None else None,
        "revenue_max_usd": int(rev[1]) if rev and rev[1] is not None else None,
        "industries": industries,
        "countries": countries,
        "company_count": count,
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
        stmt = stmt.where(Company.import_batch_id == import_batch_id)
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
