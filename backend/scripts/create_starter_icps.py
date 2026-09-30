"""One-off backfill: gives existing organisations the same Starter ICP new
sign-ups get, and re-fills any still-unedited Starter ICP with the current
(LLM-assisted) logic.

Why this exists: onboarding stopped creating an ICP in 2ba62a9, so the ICP
page was empty after setup. New onboardings now get an editable Starter ICP
in their first workspace (see services/starter_icp.py). This script:

  1. creates one for every organisation that has NO ICP in ANY workspace
     (in its earliest-created workspace), and
  2. re-fills every Starter ICP still flagged auto_generated (i.e. never
     edited by the user) - including ones created by the first version of
     this script, which the b5e2d8f1c3a7 migration flagged.

Anything a user has created or edited is never touched. Safe to re-run.

Usage (from backend/): python scripts/create_starter_icps.py [--dry-run] [--no-llm]
In Docker:             docker compose exec backend python scripts/create_starter_icps.py [--dry-run]
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import exists, select  # noqa: E402

from app.core.db import async_session_maker  # noqa: E402
from app.models import IcpProfile, Organisation, Workspace  # noqa: E402
from app.services.starter_icp import (  # noqa: E402
    build_starter_values,
    create_starter_icp,
    refresh_starter_icps,
)


async def main() -> None:
    dry_run = "--dry-run" in sys.argv
    use_llm = "--no-llm" not in sys.argv
    async with async_session_maker() as session:
        has_icp = exists().where(
            IcpProfile.workspace_id == Workspace.workspace_id,
            Workspace.organisation_id == Organisation.organisation_id,
        )
        orgs_without = (await session.execute(select(Organisation).where(~has_icp))).scalars().all()
        orgs_with_starter = (
            await session.execute(
                select(Organisation)
                .join(Workspace, Workspace.organisation_id == Organisation.organisation_id)
                .join(IcpProfile, IcpProfile.workspace_id == Workspace.workspace_id)
                .where(IcpProfile.auto_generated.is_(True))
                .distinct()
            )
        ).scalars().all()

        created = refreshed = 0
        for org in orgs_without:
            first_workspace = (
                await session.execute(
                    select(Workspace)
                    .where(Workspace.organisation_id == org.organisation_id)
                    .order_by(Workspace.created_at)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if first_workspace is None:
                continue
            values = await build_starter_values(org, use_llm=use_llm)
            print(f"CREATE  {org.company_name!r} -> {first_workspace.workspace_name!r}: {values}")
            if not dry_run:
                await create_starter_icp(session, first_workspace.workspace_id, org, use_llm=use_llm)
            created += 1

        for org in orgs_with_starter:
            values = await build_starter_values(org, use_llm=use_llm)
            print(f"REFILL  {org.company_name!r}: {values}")
            if not dry_run:
                refreshed += await refresh_starter_icps(session, org.organisation_id, use_llm=use_llm)
            else:
                refreshed += 1

        verb = "would be" if dry_run else "were"
        print(f"\n{'DRY RUN - ' if dry_run else ''}{created} Starter ICP(s) {verb} created, "
              f"{refreshed} {verb} re-filled.{' Nothing written.' if dry_run else ''}")


if __name__ == "__main__":
    asyncio.run(main())
