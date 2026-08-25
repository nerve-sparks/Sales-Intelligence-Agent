"""Read-only, org-wide BuyingEvent queries backing Signal Intelligence (brief
item 15) - the active evidence feed. The legacy Signal table (signal_directory.py)
is retained only for historical records; new/active pages read this module.

Batch scoping goes through the CompanyImportBatch membership table (not
Company.import_batch_id), consistent with the rest of the evidence pipeline
(brief item 5) - a re-upload never silently excludes a company from an
earlier batch's signal view.

Non-negative events only (unless explicitly noted) - negative events
(vendor_selected, project_cancelled, etc.) are a distinct concept surfaced
via Score Breakdown, not "signals" in the feed sense.
"""

import re
from collections import Counter
from uuid import UUID

from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BuyingEvent, Company, CompanyImportBatch, DecisionMaker

# Relevance tiers (BuyingEvent.relevance is the LLM's xsparks_relevance, 0-1) -
# replaces the old signal_confidence-based high/medium/low intent split
# (brief item 24: no "intent tier" language in the active product).
HIGH_RELEVANCE = 0.65
MEDIUM_RELEVANCE = 0.40

# "Actionable" proxy: active/announced status (STATUS_FACTOR >= 0.90), not a
# vague marketing mention.
ACTIONABLE_STATUS_FACTOR = 0.90


def _in_batch(import_batch_id: UUID):
    return Company.company_id.in_(
        select(CompanyImportBatch.company_id).where(CompanyImportBatch.import_batch_id == import_batch_id)
    )


def _base_stmt(organisation_id: UUID, include_stale: bool = False):
    stmt = (
        select(BuyingEvent, Company.company_name)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(Company.organisation_id == organisation_id, BuyingEvent.is_negative.is_(False))
    )
    if not include_stale:
        stmt = stmt.where(BuyingEvent.is_stale.is_(False))
    return stmt


# Sort keys the feed offers. Every one is DESCENDING - a signal feed is read
# newest/strongest first, and an ascending option would only ever surface the
# stalest or weakest evidence.
SORT_KEYS = ("date", "score", "company")


async def list_events(
    session: AsyncSession,
    organisation_id: UUID,
    page: int,
    page_size: int,
    category: str | None = None,
    import_batch_id: UUID | None = None,
    event_type: str | None = None,
    min_score: float | None = None,
    sector: str | None = None,
    sort: str = "date",
):
    stmt = _base_stmt(organisation_id)
    if category:
        stmt = stmt.where(BuyingEvent.category == category)
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    if event_type:
        stmt = stmt.where(BuyingEvent.event_type == event_type)
    if min_score is not None:
        stmt = stmt.where(BuyingEvent.event_score >= min_score)
    if sector:
        # Reuses the single industry->sector mapping rather than restating it.
        from app.services.company_directory import _sector_condition

        condition = _sector_condition(sector)
        if condition is not None:
            stmt = stmt.where(condition)

    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    # Future published_at values are extraction mistakes (LLM guessed a year),
    # not upcoming events. Treat them like unknown dates for ordering so they
    # don't float to the top of "Newest first".
    published = case(
        (BuyingEvent.published_at > func.now(), None),
        else_=BuyingEvent.published_at,
    )

    # Every ordering keeps published desc as the final tie-break so equal
    # scores (or equal company names) still read newest-first rather than in
    # whatever order the planner returns.
    if sort == "score":
        order = (BuyingEvent.event_score.desc().nulls_last(), published.desc().nulls_last())
    elif sort == "company":
        order = (Company.company_name.asc(), published.desc().nulls_last())
    else:
        order = (published.desc().nulls_last(), BuyingEvent.created_at.desc())

    stmt = stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(stmt)).all()
    return rows, total


async def get_event(session: AsyncSession, organisation_id: UUID, buying_event_id: UUID):
    stmt = (
        select(BuyingEvent, Company.company_name)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(BuyingEvent.buying_event_id == buying_event_id, Company.organisation_id == organisation_id)
    )
    return (await session.execute(stmt)).first()


async def get_events_for_company(session: AsyncSession, organisation_id: UUID, company_id: UUID):
    stmt = (
        select(BuyingEvent)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(
            BuyingEvent.company_id == company_id,
            Company.organisation_id == organisation_id,
            BuyingEvent.is_negative.is_(False),
            BuyingEvent.is_stale.is_(False),
        )
        .order_by(BuyingEvent.event_score.desc().nulls_last())
    )
    return (await session.execute(stmt)).scalars().all()


def _relevance_tier():
    return case(
        (BuyingEvent.relevance >= HIGH_RELEVANCE, "high"),
        (BuyingEvent.relevance >= MEDIUM_RELEVANCE, "medium"),
        else_="low",
    )


async def relevance_counts(
    session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None
) -> dict[str, int]:
    tier = _relevance_tier()
    stmt = select(tier.label("tier"), func.count()).select_from(BuyingEvent).join(
        Company, Company.company_id == BuyingEvent.company_id
    ).where(Company.organisation_id == organisation_id, BuyingEvent.is_negative.is_(False), BuyingEvent.is_stale.is_(False)).group_by(tier)
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    rows = (await session.execute(stmt)).all()
    counts = {"high": 0, "medium": 0, "low": 0}
    counts.update({tier_name: count for tier_name, count in rows})
    return counts


async def counts_by_category(session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None):
    stmt = (
        select(
            BuyingEvent.category,
            func.count(),
            func.count(func.distinct(BuyingEvent.company_id)),
            func.avg(BuyingEvent.extraction_confidence),
        )
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(Company.organisation_id == organisation_id, BuyingEvent.is_negative.is_(False), BuyingEvent.is_stale.is_(False))
        .group_by(BuyingEvent.category)
        .order_by(func.count().desc())
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    return (await session.execute(stmt)).all()


async def org_totals(session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None) -> dict:
    stmt = (
        select(
            func.count(),
            func.count(func.distinct(BuyingEvent.company_id)),
            func.avg(BuyingEvent.extraction_confidence),
        )
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(Company.organisation_id == organisation_id, BuyingEvent.is_negative.is_(False), BuyingEvent.is_stale.is_(False))
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    total, company_count, avg_confidence = (await session.execute(stmt)).one()
    return {
        "total": total,
        "company_count": company_count,
        "avg_confidence": float(avg_confidence) if avg_confidence is not None else None,
    }


# Trend window. published_at spans years of real event dates (296 distinct days
# in the live data), and plotting all of them puts ~300 points on a 580px chart -
# unreadable, and dominated by history nobody is acting on. 90 days is the
# window a rep actually works.
TREND_WINDOW_DAYS = 90


async def trend_by_day(session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None):
    tier = _relevance_tier()
    # published_at, NOT created_at. created_at is when WE inserted the row, so a
    # single research run stamps every event with the same day and the chart
    # collapses to one point - "Signal Trend Over Time" then showed a flat dot
    # on the dashboard and an empty state on Signal Intelligence (which requires
    # >= 2 points), despite 8+ distinct days of real event dates in the data.
    #
    # Events with no published_at are excluded rather than bucketed: an undated
    # event cannot be placed on a timeline, and defaulting it to today is what
    # produced the false "all activity happened today" picture in the first place.
    day = func.date(BuyingEvent.published_at)
    stmt = (
        select(day.label("day"), tier.label("tier"), func.count())
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(
            Company.organisation_id == organisation_id,
            BuyingEvent.is_negative.is_(False),
            BuyingEvent.is_stale.is_(False),
            BuyingEvent.published_at.isnot(None),
            BuyingEvent.published_at >= func.now() - text(f"interval '{TREND_WINDOW_DAYS} days'"),
            # Cap at "now" so future-dated extraction mistakes (2030-01-01 etc.)
            # do not stretch the x-axis past today and flatten recent activity.
            BuyingEvent.published_at <= func.now(),
        )
        .group_by(day, tier)
        .order_by(day)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    rows = (await session.execute(stmt)).all()

    by_day: dict = {}
    for day_value, tier_name, count in rows:
        bucket = by_day.setdefault(day_value, {"high": 0, "medium": 0, "low": 0})
        bucket[tier_name] = count
    return [
        {"date": day_value, "high": b["high"], "medium": b["medium"], "low": b["low"], "total": b["high"] + b["medium"] + b["low"]}
        for day_value, b in sorted(by_day.items())
    ]


async def top_events(session: AsyncSession, organisation_id: UUID, limit: int = 5, import_batch_id: UUID | None = None):
    stmt = _base_stmt(organisation_id).order_by(BuyingEvent.event_score.desc().nulls_last()).limit(limit)
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    return (await session.execute(stmt)).all()


CONFIDENCE_BUCKETS = ["0-20", "20-40", "40-60", "60-80", "80-100"]


async def confidence_histogram(session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None):
    pct = BuyingEvent.extraction_confidence * 100
    bucket = case(
        (pct < 20, "0-20"),
        (pct < 40, "20-40"),
        (pct < 60, "40-60"),
        (pct < 80, "60-80"),
        else_="80-100",
    )
    stmt = (
        select(bucket.label("bucket"), func.count())
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(
            Company.organisation_id == organisation_id,
            BuyingEvent.extraction_confidence.is_not(None),
            BuyingEvent.is_negative.is_(False),
            BuyingEvent.is_stale.is_(False),
        )
        .group_by(bucket)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    rows = dict((await session.execute(stmt)).all())
    return [{"bucket": b, "count": rows.get(b, 0)} for b in CONFIDENCE_BUCKETS]


async def counts_by_country(session: AsyncSession, organisation_id: UUID, limit: int = 10, import_batch_id: UUID | None = None):
    stmt = (
        select(Company.country, func.count())
        .select_from(BuyingEvent)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(
            Company.organisation_id == organisation_id,
            Company.country.is_not(None),
            BuyingEvent.is_negative.is_(False),
            BuyingEvent.is_stale.is_(False),
        )
        .group_by(Company.country)
        .order_by(func.count().desc())
        .limit(limit)
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    return (await session.execute(stmt)).all()


async def executives_impacted(session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None) -> int:
    companies_with_events = (
        select(BuyingEvent.company_id)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(Company.organisation_id == organisation_id, BuyingEvent.is_negative.is_(False), BuyingEvent.is_stale.is_(False))
        .distinct()
    )
    if import_batch_id is not None:
        companies_with_events = companies_with_events.where(_in_batch(import_batch_id))
    stmt = select(func.count()).select_from(DecisionMaker).where(DecisionMaker.company_id.in_(companies_with_events))
    return (await session.execute(stmt)).scalar_one()


async def actionable_count(session: AsyncSession, organisation_id: UUID, import_batch_id: UUID | None = None) -> int:
    stmt = (
        select(func.count())
        .select_from(BuyingEvent)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(
            Company.organisation_id == organisation_id,
            BuyingEvent.is_negative.is_(False),
            BuyingEvent.is_stale.is_(False),
            BuyingEvent.status_factor >= ACTIONABLE_STATUS_FACTOR,
        )
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    return (await session.execute(stmt)).scalar_one()


_HOST_RE = re.compile(r"^www\.")


async def top_sources(session: AsyncSession, organisation_id: UUID, limit: int = 5, import_batch_id: UUID | None = None):
    """Each BuyingEvent carries a list of evidence sources (JSONB) with a
    domain per source - counts every corroborating source across every event,
    grouped by domain (brief item 15: real source breakdown, not a single
    original_source string)."""
    stmt = (
        select(BuyingEvent.evidence)
        .join(Company, Company.company_id == BuyingEvent.company_id)
        .where(Company.organisation_id == organisation_id, BuyingEvent.is_negative.is_(False), BuyingEvent.is_stale.is_(False))
    )
    if import_batch_id is not None:
        stmt = stmt.where(_in_batch(import_batch_id))
    rows = (await session.execute(stmt)).scalars().all()

    counts: Counter[str] = Counter()
    for evidence in rows:
        for source in evidence or []:
            domain = source.get("domain") if isinstance(source, dict) else None
            if domain:
                counts[_HOST_RE.sub("", domain.lower())] += 1

    return [{"source": name, "count": count} for name, count in counts.most_common(limit)]
