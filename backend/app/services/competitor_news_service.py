"""News about the tenant's COMPETITORS (not prospects) for the dashboard's
Competitor News tab.

For each AI-identified competitor (Organisation.competitors, from the Offering
Profile sync): one you.com search, the same is_relevant guard research uses,
then one LLM call that keeps only real news about that competitor, files it
under a category and says in one line why it matters to the seller.

Kept to the last NEWS_RETENTION_DAYS: older rows are deleted on every refresh.
A failed search or LLM call for one competitor keeps that competitor's existing
rows - it never wipes them.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import CompetitorNews, Organisation
from app.services import buying_event_service, llm_client, you_client
from app.services.competitor_matching import clean_competitors
from app.services.offering_profile_service import profile_for_scoring

logger = logging.getLogger(__name__)

CATEGORIES = ("funding", "launch", "partnership", "customer_win", "hiring", "leadership", "other")
MAX_ITEMS_PER_COMPETITOR = 10
CONCURRENCY = 4


def _age_column():
    return func.coalesce(CompetitorNews.published_at, CompetitorNews.discovered_at)


async def purge_old(session: AsyncSession, organisation_id: UUID, now: datetime) -> int:
    cutoff = now - timedelta(days=get_settings().news_retention_days)
    result = await session.execute(
        delete(CompetitorNews).where(CompetitorNews.organisation_id == organisation_id, _age_column() < cutoff)
    )
    return result.rowcount or 0


async def list_news(
    session: AsyncSession, organisation_id: UUID, days: int, limit: int, category: str | None = None
) -> list[CompetitorNews]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = select(CompetitorNews).where(CompetitorNews.organisation_id == organisation_id, _age_column() >= cutoff)
    if category:
        stmt = stmt.where(CompetitorNews.category == category)
    stmt = stmt.order_by(_age_column().desc(), CompetitorNews.discovered_at.desc()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


def _build_prompt(seller_summary: str, competitor: dict, items: list[dict]) -> str:
    lines = "\n".join(
        f"[{i}] title: {it.get('title')!r} | snippet: {(it.get('snippet') or '')[:400]!r} | "
        f"url: {it.get('link')} | published: {it.get('date')}"
        for i, it in enumerate(items)
    )
    return (
        "You are a competitive-intelligence analyst for a B2B sales team.\n\n"
        f"What the seller offers:\n{seller_summary}\n\n"
        f"Competitor: {competitor['name']} (domain: {competitor.get('domain') or 'unknown'}).\n\n"
        "For EACH web result below, decide whether it is a real, recent NEWS item about THIS "
        "competitor itself (not a same-name company, not a generic industry article, not a "
        "directory or profile page). For real news set is_news=true, choose category from: "
        f"{' | '.join(CATEGORIES)}, write a one-sentence neutral summary, and a one-sentence "
        "why_it_matters for the seller's sales team (e.g. a funded competitor will push harder "
        "in deals; a competitor's new customer may have reference value; a launch may overlap an "
        "offering). Otherwise set is_news=false.\n\n"
        f"Web results:\n{lines}\n\n"
        "Respond with ONLY a JSON array, one object per result, no prose:\n"
        '[{"index":0,"is_news":true,"category":"funding","summary":"","why_it_matters":""}]'
    )


def _parse_published(raw, now: datetime) -> datetime | None:
    """you.com's page_age is a full ISO timestamp; fall back to the research
    parser for "Jan 21, 2026" / "3 days ago" forms. Future dates are unknown."""
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        parsed = buying_event_service.parse_event_date(str(raw), now)
    if parsed is None or parsed > now + timedelta(days=1):
        return None
    return parsed


def _parse(raw: str) -> list[dict] | None:
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end == -1:
        return None
    try:
        parsed = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    return [p for p in parsed if isinstance(p, dict)] if isinstance(parsed, list) else None


async def _collect_one(competitor: dict, seller_summary: str, organisation_id: UUID, now: datetime) -> list[dict] | None:
    """News rows for one competitor, or None when search/LLM failed (so the
    caller keeps whatever was stored before)."""
    name, domain = competitor["name"], competitor.get("domain")
    try:
        raw_results = await you_client.search(domain, name)
    except Exception as exc:
        print(f"[NEWS]     competitor '{name}': search FAILED ({type(exc).__name__}: {exc}) - keeping stored news")
        logger.warning("competitor news search failed for %r: %s", name, exc)
        return None
    items = [
        r for r in raw_results
        if r.get("link") and r.get("title") and you_client.is_relevant(domain or "", name, r)
    ][:MAX_ITEMS_PER_COMPETITOR]
    if not items:
        print(f"[NEWS]     competitor '{name}': no relevant results")
        return []
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _build_prompt(seller_summary, competitor, items)}],
            generation_name="summarise-competitor-news",
            temperature=0,
            trace_user_id=str(organisation_id),
        )
    except Exception as exc:
        print(f"[NEWS]     competitor '{name}': LLM FAILED ({type(exc).__name__}: {exc}) - keeping stored news")
        logger.warning("competitor news LLM failed for %r: %s", name, exc)
        return None
    parsed = _parse(raw)
    if parsed is None:
        print(f"[NEWS]     competitor '{name}': LLM reply unparseable - keeping stored news")
        return None

    cutoff = now - timedelta(days=get_settings().news_retention_days)
    rows = []
    for cls in parsed:
        idx = cls.get("index")
        if not isinstance(idx, int) or not 0 <= idx < len(items) or not cls.get("is_news"):
            continue
        item = items[idx]
        published = _parse_published(item.get("date"), now)
        if published is not None and published < cutoff:
            continue
        category = cls.get("category") if cls.get("category") in CATEGORIES else "other"
        rows.append({
            "organisation_id": organisation_id,
            "competitor_name": name,
            "competitor_domain": domain,
            "title": str(item.get("title"))[:500],
            "summary": (cls.get("summary") or None),
            "why_it_matters": (cls.get("why_it_matters") or None),
            "category": category,
            "url": item["link"],
            "source_domain": you_client._result_domain(item["link"]),
            "published_at": published,
            "discovered_at": now,
        })
    print(f"[NEWS]     competitor '{name}': {len(rows)} news item(s) kept from {len(items)} relevant result(s)")
    return rows


async def refresh_competitor_news(session: AsyncSession, organisation_id: UUID) -> dict:
    """Purges news past the retention window, then fetches fresh news for
    every competitor. Commits. Returns a small summary."""
    now = datetime.now(timezone.utc)
    purged = await purge_old(session, organisation_id, now)
    org = await session.get(Organisation, organisation_id)
    competitors = clean_competitors(org.competitors if org is not None else None)
    summary = {"competitors": len(competitors), "stored": 0, "failed": 0, "purged": purged}
    print(f"\n[NEWS] >>> Competitor news refresh: {len(competitors)} competitor(s), "
          f"deleted {purged} item(s) older than {get_settings().news_retention_days} days")
    if not competitors or not you_client.is_configured() or not llm_client.is_configured():
        reason = "no competitors identified yet" if not competitors else "web search or LLM not configured"
        print(f"[NEWS] <<< Competitor news refresh skipped: {reason}")
        await session.commit()
        return summary

    seller_summary = buying_event_service._offering_summary(profile_for_scoring(org))
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def _bounded(competitor):
        async with semaphore:
            return await _collect_one(competitor, seller_summary, organisation_id, now)

    for rows in await asyncio.gather(*[_bounded(c) for c in competitors]):
        if rows is None:
            summary["failed"] += 1
            continue
        for row in rows:
            stmt = insert(CompetitorNews).values(**row)
            stmt = stmt.on_conflict_do_update(
                constraint="competitor_news_org_url_key",
                set_={k: stmt.excluded[k] for k in ("title", "summary", "why_it_matters", "category", "published_at")},
            )
            await session.execute(stmt)
            summary["stored"] += 1
    await session.commit()
    logger.info("competitor news refreshed: %s", summary)
    print(f"[NEWS] <<< Competitor news refresh done: {summary['stored']} item(s) saved, "
          f"{summary['failed']} competitor(s) failed")
    return summary


async def refresh_competitor_news_in_background(organisation_id: UUID) -> None:
    try:
        async with async_session_maker() as session:
            await refresh_competitor_news(session, organisation_id)
    except Exception:
        logger.exception("competitor news refresh failed", extra={"job_id": str(organisation_id), "stage": "news"})
