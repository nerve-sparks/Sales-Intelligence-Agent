"""Make companies and contacts workspace-scoped, not organisation-scoped.

Company and DecisionMaker carried only `organisation_id`, so every Workspace
under an Organisation saw the SAME company pool: switching workspace changed
the Upload History / ICPs / Triggers (all genuinely workspace-scoped) but left
the Enterprise List, Dashboard and every signal identical, and a brand-new
workspace opened showing companies it had never uploaded.

`workspace_id` is added to both tables and the uniqueness keys move with it:

    company        (organisation_id, zi_company_id) -> (workspace_id, zi_company_id)
    decision_maker (organisation_id, zi_person_id)  -> (workspace_id, zi_person_id)

Moving the unique key is what actually creates isolation rather than just
filtering a shared pool: the same prospect uploaded into two workspaces now
becomes two independent rows, each with its own research, signals and score,
instead of one row the second upload silently merges into.

`organisation_id` STAYS on both tables. It is still the tenancy/authorisation
boundary (require_organisation_member) and every workspace belongs to exactly
one organisation, so the column is a denormalised parent pointer, not dead
weight - dropping it would force a workspace join on every permission check.

Backfill: a company belongs to the workspace of the EARLIEST import batch it
appears in (company_import_batch -> icp_import_batch.workspace_id). Earliest
rather than latest so a company that was later re-uploaded into a second
workspace stays with the one that first sourced it - the alternative silently
moves history between workspaces. Anything with no batch at all (older rows,
or a company whose batch was deleted) falls back to its organisation's oldest
workspace, which is the workspace a single-workspace tenant has always been
using anyway. DecisionMaker inherits its company's workspace.

Revision ID: a3f8d21c6b94
Revises: e2b9c4f7a1d8
Create Date: 2026-09-24 10:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f8d21c6b94"
down_revision: Union[str, None] = "e2b9c4f7a1d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Nullable first - the rows have to be backfilled before NOT NULL can hold.
    op.add_column("company", sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "decision_maker", sa.Column("workspace_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True)
    )

    # 2a. Company -> the workspace of its earliest import batch.
    op.execute(
        """
        UPDATE company c
        SET workspace_id = sub.workspace_id
        FROM (
            SELECT DISTINCT ON (cib.company_id)
                   cib.company_id, b.workspace_id
            FROM company_import_batch cib
            JOIN icp_import_batch b ON b.import_batch_id = cib.import_batch_id
            ORDER BY cib.company_id, b.created_at ASC
        ) AS sub
        WHERE c.company_id = sub.company_id
        """
    )

    # 2b. Anything still unassigned -> its organisation's oldest workspace.
    op.execute(
        """
        UPDATE company c
        SET workspace_id = sub.workspace_id
        FROM (
            SELECT DISTINCT ON (w.organisation_id)
                   w.organisation_id, w.workspace_id
            FROM workspace w
            ORDER BY w.organisation_id, w.created_at ASC
        ) AS sub
        WHERE c.workspace_id IS NULL
          AND c.organisation_id = sub.organisation_id
        """
    )

    # 2c. Contacts follow their company.
    op.execute(
        """
        UPDATE decision_maker dm
        SET workspace_id = c.workspace_id
        FROM company c
        WHERE dm.company_id = c.company_id
        """
    )

    # 3. A company whose organisation has NO workspace at all cannot be scoped
    #    to one, and would block the NOT NULL below. That is orphaned data (an
    #    organisation abandoned before its first workspace was created), so it
    #    goes rather than blocking the migration - its rows are unreachable in
    #    the UI either way, which is exactly why they were never noticed.
    op.execute("DELETE FROM decision_maker WHERE workspace_id IS NULL")
    op.execute("DELETE FROM company WHERE workspace_id IS NULL")

    op.alter_column("company", "workspace_id", nullable=False)
    op.alter_column("decision_maker", "workspace_id", nullable=False)

    op.create_foreign_key(
        "company_workspace_id_fkey", "company", "workspace", ["workspace_id"], ["workspace_id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        "decision_maker_workspace_id_fkey",
        "decision_maker",
        "workspace",
        ["workspace_id"],
        ["workspace_id"],
        ondelete="CASCADE",
    )

    # 4. Uniqueness moves to the workspace - the actual isolation guarantee.
    op.drop_constraint("company_org_zi_id_key", "company", type_="unique")
    op.create_unique_constraint("company_workspace_zi_id_key", "company", ["workspace_id", "zi_company_id"])
    op.drop_constraint("decision_maker_org_zi_person_id_key", "decision_maker", type_="unique")
    op.create_unique_constraint(
        "decision_maker_workspace_zi_person_id_key", "decision_maker", ["workspace_id", "zi_person_id"]
    )

    op.create_index("idx_company_workspace_id", "company", ["workspace_id"])
    op.create_index("idx_dm_workspace_id", "decision_maker", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("idx_dm_workspace_id", table_name="decision_maker")
    op.drop_index("idx_company_workspace_id", table_name="company")

    op.drop_constraint("decision_maker_workspace_zi_person_id_key", "decision_maker", type_="unique")
    op.create_unique_constraint(
        "decision_maker_org_zi_person_id_key", "decision_maker", ["organisation_id", "zi_person_id"]
    )
    op.drop_constraint("company_workspace_zi_id_key", "company", type_="unique")
    op.create_unique_constraint("company_org_zi_id_key", "company", ["organisation_id", "zi_company_id"])

    op.drop_constraint("decision_maker_workspace_id_fkey", "decision_maker", type_="foreignkey")
    op.drop_constraint("company_workspace_id_fkey", "company", type_="foreignkey")
    op.drop_column("decision_maker", "workspace_id")
    op.drop_column("company", "workspace_id")
