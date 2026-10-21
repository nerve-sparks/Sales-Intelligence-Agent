"""News about the top 50 global AI companies - the dashboard's Latest News card.

Global, not per organisation: the same feed for every tenant, refreshed once
per NEWS_REFRESH_INTERVAL_HOURS by news_scheduler.

  1. Company list: a few you.com searches for the leading AI companies, then
     one LLM call picks the top 50 (name + main domain) from those results and
     its own knowledge. A failed rebuild keeps the previous list.
  2. News: per company, one you.com search, the same is_relevant guard
     research uses, then one LLM call that keeps only real news about that
     company and files it under a category.

Cost per run: ~53 searches + ~51 LLM calls, shared by every organisation.
News older than NEWS_RETENTION_DAYS is deleted on every refresh; a failed
search or LLM call for one company keeps that company's stored news.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import async_session_maker
from app.models import AiMarketCompany, AiMarketNews
from app.services import llm_client, you_client
from app.services.competitor_matching import clean_competitors
from app.services.competitor_news_service import _parse, _parse_published

logger = logging.getLogger(__name__)

TOP_N = 50
CATEGORIES = ("product_launch", "funding", "press_briefing", "buying_signal")
MAX_ITEMS_PER_COMPANY = 8
CONCURRENCY = 4
DISCOVERY_QUERIES = (
    "top artificial intelligence companies in the world",
    "leading AI companies 2026 list",
    "biggest generative AI startups by valuation",
)


def _age_column():
    return func.coalesce(AiMarketNews.published_at, AiMarketNews.discovered_at)


# ── 1. the top-50 list ────────────────────────────────────────────────────


def _discovery_prompt(results: list[dict]) -> str:
    lines = "\n".join(
        f"- {r.get('title')!r}: {(r.get('snippet') or '')[:300]!r}" for r in results if r.get("title")
    )
    return (
        f"List the top {TOP_N} companies in the world working in artificial intelligence today: "
        "frontier model labs, AI chip and infrastructure makers, cloud and enterprise AI platforms, "
        "and the most significant AI startups. Use the web results below as current context plus your "
        "own knowledge. Only real companies; give each one's main website domain.\n\n"
        f"Web results:\n{lines}\n\n"
        f"Respond with ONLY a JSON array of exactly {TOP_N} objects ordered by importance, no prose:\n"
        '[{"name":"OpenAI","domain":"openai.com"}]'
    )


async def refresh_company_list(session: AsyncSession) -> list[dict]:
    """Rebuilds the top-50 list. Returns the list in use afterwards (the new
    one, or the stored one when the rebuild failed)."""
    results: list[dict] = []
    for query in DISCOVERY_QUERIES:
        try:
            results.extend(await you_client.search_query(query))
        except Exception as exc:
            print(f"[NEWS]     AI company discovery search failed for {query!r}: {type(exc).__name__}: {exc}")
    companies: list[dict] = []
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _discovery_prompt(results)}],
            generation_name="discover-top-ai-companies",
            temperature=0,
        )
        companies = clean_competitors(_parse(raw) or [], limit=TOP_N) if raw else []
    except Exception as exc:
        print(f"[NEWS]     AI company discovery LLM failed: {type(exc).__name__}: {exc}")

    if len(companies) < 10:
        stored = await stored_companies(session)
        print(f"[NEWS]     AI company list not rebuilt ({len(companies)} found) - keeping {len(stored)} stored")
        return stored

    now = datetime.now(timezone.utc)
    await session.execute(delete(AiMarketCompany))
    for rank, c in enumerate(companies, start=1):
        session.add(AiMarketCompany(rank=rank, name=c["name"], domain=c.get("domain"), updated_at=now))
    await session.commit()
    print(f"[NEWS]     AI company list rebuilt: {len(companies)} companies "
          f"({', '.join(c['name'] for c in companies[:8])}{', ...' if len(companies) > 8 else ''})")
    return companies


async def stored_companies(session: AsyncSession) -> list[dict]:
    rows = (await session.execute(select(AiMarketCompany).order_by(AiMarketCompany.rank))).scalars().all()
    return [{"name": r.name, "domain": r.domain} for r in rows]


# ── 2. news per company ───────────────────────────────────────────────────


def _news_prompt(company: dict, items: list[dict]) -> str:
    lines = "\n".join(
        f"[{i}] title: {it.get('title')!r} | snippet: {(it.get('snippet') or '')[:400]!r} | "
        f"url: {it.get('link')} | published: {it.get('date')}"
        for i, it in enumerate(items)
    )
    return (
        "You are an AI-industry news editor for a B2B sales team.\n\n"
        f"Company: {company['name']} (domain: {company.get('domain') or 'unknown'}).\n\n"
        "For EACH web result below, decide whether it is a real, recent NEWS item about THIS company "
        "(not a same-name company, not a generic article, not a profile or directory page). For real "
        "news set is_news=true, write a one-sentence neutral summary, and choose category:\n"
        "- product_launch: a new model, product, feature or service released or announced\n"
        "- funding: a funding round, investment, valuation, IPO or major capital raise\n"
        "- press_briefing: an official announcement, press release, earnings, leadership or strategy update\n"
        "- buying_signal: a partnership, enterprise deal, customer win, contract or acquisition\n"
        "Otherwise set is_news=false.\n\n"
        f"Web results:\n{lines}\n\n"
        "Respond with ONLY a JSON array, one object per result, no prose:\n"
        '[{"index":0,"is_news":true,"category":"funding","summary":""}]'
    )


async def _collect_one(company: dict, now: datetime) -> list[dict] | None:
    """News rows for one company, or None when search/LLM failed."""
    name, domain = company["name"], company.get("domain")
    try:
        raw_results = await you_client.search(domain, name)
    except Exception as exc:
        print(f"[NEWS]     '{name}': search FAILED ({type(exc).__name__}: {exc}) - keeping stored news")
        return None
    items = [
        r for r in raw_results
        if r.get("link") and r.get("title") and you_client.is_relevant(domain or "", name, r)
    ][:MAX_ITEMS_PER_COMPANY]
    if not items:
        print(f"[NEWS]     '{name}': no relevant results")
        return []
    try:
        raw = await llm_client.complete(
            [{"role": "user", "content": _news_prompt(company, items)}],
            generation_name="summarise-ai-market-news",
            temperature=0,
        )
    except Exception as exc:
        print(f"[NEWS]     '{name}': LLM FAILED ({type(exc).__name__}: {exc}) - keeping stored news")
        return None
    parsed = _parse(raw)
    if parsed is None:
        print(f"[NEWS]     '{name}': LLM reply unparseable - keeping stored news")
        return None

    cutoff = now - timedelta(days=get_settings().news_retention_days)
    rows = []
    for cls in parsed:
        idx = cls.get("index")
        if not isinstance(idx, int) or not 0 <= idx < len(items) or not cls.get("is_news"):
            continue
        if cls.get("category") not in CATEGORIES:
            continue
        item = items[idx]
        published = _parse_published(item.get("date"), now)
        if published is not None and published < cutoff:
            continue
        rows.append({
            "company_name": name,
            "company_domain": domain,
            "title": str(item.get("title"))[:500],
            "summary": cls.get("summary") or None,
            "category": cls["category"],
            "url": item["link"],
            "source_domain": you_client._result_domain(item["link"]),
            "published_at": published,
            "discovered_at": now,
        })
    print(f"[NEWS]     '{name}': {len(rows)} news item(s) kept from {len(items)} relevant result(s)")
    return rows


async def purge_old(session: AsyncSession, now: datetime) -> int:
    cutoff = now - timedelta(days=get_settings().news_retention_days)
    result = await session.execute(delete(AiMarketNews).where(_age_column() < cutoff))
    return result.rowcount or 0


async def refresh_ai_market_news(session: AsyncSession) -> dict:
    """Purge, rebuild the company list, fetch news for each company. Commits."""
    now = datetime.now(timezone.utc)
    purged = await purge_old(session, now)
    await session.commit()
    print(f"\n[NEWS] >>> AI market news refresh: deleted {purged} item(s) older than "
          f"{get_settings().news_retention_days} days")
    summary = {"companies": 0, "stored": 0, "failed": 0, "purged": purged}
    if not you_client.is_configured() or not llm_client.is_configured():
        print("[NEWS] <<< AI market news refresh skipped: web search or LLM not configured")
        return summary

    companies = await refresh_company_list(session)
    summary["companies"] = len(companies)
    if not companies:
        print("[NEWS] <<< AI market news refresh skipped: no AI company list yet")
        return summary

    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def _bounded(company):
        async with semaphore:
            return await _collect_one(company, now)

    for rows in await asyncio.gather(*[_bounded(c) for c in companies]):
        if rows is None:
            summary["failed"] += 1
            continue
        for row in rows:
            stmt = insert(AiMarketNews).values(**row)
            stmt = stmt.on_conflict_do_update(
                index_elements=["url"],
                set_={k: stmt.excluded[k] for k in ("title", "summary", "category", "published_at")},
            )
            await session.execute(stmt)
            summary["stored"] += 1
    await session.commit()
    print(f"[NEWS] <<< AI market news refresh done: {summary['stored']} item(s) saved across "
          f"{summary['companies']} companies, {summary['failed']} company(ies) failed")
    return summary


async def refresh_ai_market_news_in_background() -> None:
    try:
        async with async_session_maker() as session:
            await refresh_ai_market_news(session)
    except Exception:
        logger.exception("AI market news refresh failed", extra={"job_id": "ai-market-news", "stage": "news"})


async def list_news(
    session: AsyncSession, days: int, limit: int, category: str | None = None, offset: int = 0
) -> list[AiMarketNews]:
    stmt = _news_filter(select(AiMarketNews), days, category)
    stmt = stmt.order_by(_age_column().desc(), AiMarketNews.discovered_at.desc()).offset(offset).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


async def count_news(session: AsyncSession, days: int, category: str | None = None) -> int:
    stmt = _news_filter(select(func.count()).select_from(AiMarketNews), days, category)
    return (await session.execute(stmt)).scalar_one()


def _news_filter(stmt, days: int, category: str | None):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = stmt.where(_age_column() >= cutoff)
    if category:
        stmt = stmt.where(AiMarketNews.category == category)
    return stmt
