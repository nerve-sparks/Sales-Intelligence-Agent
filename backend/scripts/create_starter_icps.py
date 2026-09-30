"""One-off backfill: gives organisations that onboarded before the Starter
ICP existed the same Starter ICP new sign-ups now get.

Why this exists: onboarding stopped creating an ICP in 2ba62a9, so the ICP
page was empty after setup. New onboardings now get an editable "Starter ICP"
in their first workspace (controllers/workspaces.py -> create_starter_icp),
built from the industry and headquarters they entered. This script applies
the same thing to existing organisations.

Only touches an organisation that has NO ICP in ANY of its workspaces, and
only its first (earliest-created) workspace - anyone who already created an
ICP, anywhere, is left alone. Idempotent: a second run finds nothing to do.

Usage (from backend/): python scripts/create_starter_icps.py [--dry-run]
In Docker:             docker compose exec backend python scripts/create_starter_icps.py [--dry-run]
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import exists, select  # noqa: E402

from app.core.db import async_session_maker  # noqa: E402
from app.models import IcpProfile, Organisation, Workspace  # noqa: E402
from app.services.icp_service import create_starter_icp, starter_icp_values  # noqa: E402


async def main() -> None:
    dry_run = "--dry-run" in sys.argv
    async with async_session_maker() as session:
        has_icp = exists().where(
            IcpProfile.workspace_id == Workspace.workspace_id,
            Workspace.organisation_id == Organisation.organisation_id,
        )
        orgs = (await session.execute(select(Organisation).where(~has_icp))).scalars().all()

        created = 0
        for org in orgs:
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
            values = starter_icp_values(org)
            print(
                f"{org.company_name!r} -> workspace {first_workspace.workspace_name!r}: "
                f"industries={values['industries']} countries={values['countries']}"
            )
            if not dry_run:
                await create_starter_icp(session, first_workspace.workspace_id, org)
            created += 1

        if dry_run:
            print(f"\nDRY RUN - {created} Starter ICP(s) would be created, nothing written.")
        else:
            print(f"\nDone - {created} Starter ICP(s) created.")


if __name__ == "__main__":
    asyncio.run(main())
