"""Read-only, org-wide signal queries (cross-company feed + single-signal
lookup) - see signal_extractor.py / signal_scorer.py for the extraction and
scoring logic these rows come from.
"""

import re
from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, DecisionMaker, Signal

# Confidence tiers shown on the Signal Intelligence dashboard. signal_confidence
# is a blend of corroboration/recency/resourcing (see signal_extractor.compute_signal_confidence);
# 0.60 already marks "high" elsewhere (lead_scorer._d1_pain_acuity), so that
# anchors the high/medium boundary here too.
HIGH_CONFIDENCE = 0.60
MEDIUM_CONFIDENCE = 0.40


async def list_signals(
    session: AsyncSession, organisation_id: UUID, page: int, page_size: int, category: str | None = None
):
    stmt = (
        select(Signal, Company.company_name)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    if category:
        stmt = stmt.where(Signal.signal_category == category)

    total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    stmt = stmt.order_by(Signal.ingested_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(stmt)).all()
    return rows, total


async def get_signal(session: AsyncSession, organisation_id: UUID, signal_id: UUID):
    stmt = (
        select(Signal, Company.company_name)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Signal.signal_id == signal_id, Company.organisation_id == organisation_id)
    )
    return (await session.execute(stmt)).first()


def _confidence_tier():
    return case(
        (Signal.signal_confidence >= HIGH_CONFIDENCE, "high"),
        (Signal.signal_confidence >= MEDIUM_CONFIDENCE, "medium"),
        else_="low",
    )


async def intent_counts(session: AsyncSession, organisation_id: UUID) -> dict[str, int]:
    tier = _confidence_tier()
    stmt = (
        select(tier.label("tier"), func.count())
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
        .group_by(tier)
    )
    rows = (await session.execute(stmt)).all()
    counts = {"high": 0, "medium": 0, "low": 0}
    counts.update({tier_name: count for tier_name, count in rows})
    return counts


async def counts_by_category(session: AsyncSession, organisation_id: UUID):
    stmt = (
        select(
            Signal.signal_category,
            func.count(),
            func.count(func.distinct(Signal.company_id)),
            func.avg(Signal.signal_confidence),
        )
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
        .group_by(Signal.signal_category)
        .order_by(func.count().desc())
    )
    return (await session.execute(stmt)).all()


async def org_totals(session: AsyncSession, organisation_id: UUID) -> dict:
    stmt = (
        select(
            func.count(),
            func.count(func.distinct(Signal.company_id)),
            func.avg(Signal.signal_confidence),
        )
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    total, company_count, avg_confidence = (await session.execute(stmt)).one()
    return {
        "total": total,
        "company_count": company_count,
        "avg_confidence": float(avg_confidence) if avg_confidence is not None else None,
    }


async def trend_by_day(session: AsyncSession, organisation_id: UUID):
    tier = _confidence_tier()
    day = func.date(Signal.ingested_at)
    stmt = (
        select(day.label("day"), tier.label("tier"), func.count())
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id, Signal.ingested_at.is_not(None))
        .group_by(day, tier)
        .order_by(day)
    )
    rows = (await session.execute(stmt)).all()

    by_day: dict = {}
    for day_value, tier_name, count in rows:
        bucket = by_day.setdefault(day_value, {"high": 0, "medium": 0, "low": 0})
        bucket[tier_name] = count
    return [
        {"date": day_value, "high": b["high"], "medium": b["medium"], "low": b["low"], "total": b["high"] + b["medium"] + b["low"]}
        for day_value, b in sorted(by_day.items())
    ]


async def top_signals(session: AsyncSession, organisation_id: UUID, limit: int = 5):
    stmt = (
        select(Signal, Company.company_name)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
        .order_by(Signal.signal_confidence.desc().nulls_last())
        .limit(limit)
    )
    return (await session.execute(stmt)).all()


CONFIDENCE_BUCKETS = ["0-20", "20-40", "40-60", "60-80", "80-100"]


async def confidence_histogram(session: AsyncSession, organisation_id: UUID):
    pct = Signal.signal_confidence * 100
    bucket = case(
        (pct < 20, "0-20"),
        (pct < 40, "20-40"),
        (pct < 60, "40-60"),
        (pct < 80, "60-80"),
        else_="80-100",
    )
    stmt = (
        select(bucket.label("bucket"), func.count())
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id, Signal.signal_confidence.is_not(None))
        .group_by(bucket)
    )
    rows = dict((await session.execute(stmt)).all())
    return [{"bucket": b, "count": rows.get(b, 0)} for b in CONFIDENCE_BUCKETS]


async def counts_by_country(session: AsyncSession, organisation_id: UUID, limit: int = 10):
    stmt = (
        select(Company.country, func.count())
        .select_from(Signal)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id, Company.country.is_not(None))
        .group_by(Company.country)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return (await session.execute(stmt)).all()


async def executives_impacted(session: AsyncSession, organisation_id: UUID) -> int:
    companies_with_signals = (
        select(Signal.company_id)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
        .distinct()
    )
    stmt = select(func.count()).select_from(DecisionMaker).where(
        DecisionMaker.company_id.in_(companies_with_signals)
    )
    return (await session.execute(stmt)).scalar_one()


async def actionable_count(session: AsyncSession, organisation_id: UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(Signal)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id, Signal.is_action.is_(True))
    )
    return (await session.execute(stmt)).scalar_one()


_URL_RE = re.compile(r"https?://([^/\s]+)")


async def top_sources(session: AsyncSession, organisation_id: UUID, limit: int = 5):
    """original_source is "news:{news_id}" (news_id embeds the article URL)
    or "scoop:{scoop_id}" (no URL - internal deal intelligence). Grouping by
    the parsed hostname gives the real publication breakdown; anything
    without a parseable URL is bucketed as ZoomInfo's own intelligence."""
    stmt = (
        select(Signal.original_source)
        .join(Company, Company.company_id == Signal.company_id)
        .where(Company.organisation_id == organisation_id)
    )
    rows = (await session.execute(stmt)).scalars().all()

    counts: dict[str, int] = {}
    for original_source in rows:
        match = _URL_RE.search(original_source) if original_source else None
        if match:
            host = match.group(1).lower().removeprefix("www.")
        else:
            host = "ZoomInfo Deal Intelligence"
        counts[host] = counts.get(host, 0) + 1

    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"source": name, "count": count} for name, count in ranked]
