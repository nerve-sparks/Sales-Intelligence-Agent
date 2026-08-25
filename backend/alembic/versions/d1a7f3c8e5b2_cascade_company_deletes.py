"""Add ON DELETE CASCADE to lead_score.company_id and signal.company_id.

Deleting an upload has to delete the companies it introduced, and these were
the only two FKs onto `company` still set to NO ACTION - every other child
(buying_event, decision_maker, company_import_batch, trigger_event,
company_intent/news/scoop) already cascades. With these two blocking, any
attempt to remove a company raised "still referenced from table lead_score".

Both are genuinely derived data:
  * lead_score is 1:1 with company - a score for a company that no longer
    exists is meaningless.
  * signal is the legacy table nothing writes to any more (the evidence
    pipeline writes buying_event); its rows are historical and worthless
    without their company.

Revision ID: d1a7f3c8e5b2
Revises: c9f4a2e8b1d3
Create Date: 2026-08-25 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d1a7f3c8e5b2"
down_revision: Union[str, None] = "c9f4a2e8b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = (("lead_score", "lead_score_company_id_fkey"), ("signal", "signal_company_id_fkey"))


def upgrade() -> None:
    for table, constraint in _TABLES:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(
            constraint, table, "company", ["company_id"], ["company_id"], ondelete="CASCADE"
        )


def downgrade() -> None:
    for table, constraint in _TABLES:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.create_foreign_key(constraint, table, "company", ["company_id"], ["company_id"])
