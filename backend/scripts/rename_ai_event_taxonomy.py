"""One-off backfill: renames the AI-specific event_type/category values on
existing BuyingEvent rows to the seller-agnostic names in scoring_config.py.

Why this exists: five event_type values and two event_category values were
originally spelled "ai_..." from when this whole pipeline was built for one
AI-consulting tenant. buying_event_service._build_prompt now judges
seller_relevance dynamically against each tenant's real Offering Profile, but
the event_type/category LABEL stayed hardcoded to those AI names regardless of
the tenant - so a paperboard-and-FMCG tenant's dashboard still showed every
signal filed under "AI Seriousness" even when its relevance score was
correctly near zero. scoring_config.py and buying_event_service.py were
updated to stop emitting the old names; this script renames the values already
stored under them so historical data matches new data instead of the two
vocabularies silently diverging forever.

Pure renames, nothing dropped: unmapped values are left untouched. Idempotent -
safe to run more than once (the second run matches zero rows per mapping).

Usage: python scripts/rename_ai_event_taxonomy.py [--dry-run]
"""

import asyncio
import sys

from sqlalchemy import text

from app.core.db import async_session_maker

EVENT_TYPE_RENAMES = {
    "explicit_ai_budget": "explicit_solution_budget",
    "ai_transformation_program": "transformation_program",
    "ai_pilot_announced": "pilot_program_announced",
    "explicit_ai_tool_adoption": "solution_adoption",
    "relevant_ai_hiring": "relevant_hiring",
}

CATEGORY_RENAMES = {
    "ai_seriousness": "buyer_seriousness",
    "ai_pain_points": "buyer_pain_points",
}


async def main() -> None:
    dry_run = "--dry-run" in sys.argv
    async with async_session_maker() as session:
        total = 0
        for old, new in EVENT_TYPE_RENAMES.items():
            count = (
                await session.execute(
                    text("SELECT count(*) FROM buying_event WHERE event_type = :old"), {"old": old}
                )
            ).scalar_one()
            print(f"event_type {old!r} -> {new!r}: {count} row(s)")
            total += count
            if count and not dry_run:
                await session.execute(
                    text("UPDATE buying_event SET event_type = :new WHERE event_type = :old"),
                    {"old": old, "new": new},
                )

        for old, new in CATEGORY_RENAMES.items():
            count = (
                await session.execute(
                    text("SELECT count(*) FROM buying_event WHERE category = :old"), {"old": old}
                )
            ).scalar_one()
            print(f"category {old!r} -> {new!r}: {count} row(s)")
            total += count
            if count and not dry_run:
                await session.execute(
                    text("UPDATE buying_event SET category = :new WHERE category = :old"),
                    {"old": old, "new": new},
                )

        if dry_run:
            print(f"\nDRY RUN - {total} row(s) would be updated, nothing written.")
        else:
            await session.commit()
            print(f"\nDone - {total} row(s) updated.")


if __name__ == "__main__":
    asyncio.run(main())
