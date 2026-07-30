"""Add ON DELETE CASCADE to trigger_event.company_id.

It was the only FK on trigger_event without a delete rule (trigger_id and
buying_event_id both cascade), so deleting a Company failed with
"still referenced from table trigger_event" whenever that company had any
trigger match - forcing a manual DELETE FROM trigger_event first (hit twice
while cleaning up test uploads, and it broke the test suite's own
organisation-teardown fixture).

A trigger match is derived data about a company; when the company goes, the
match should go with it, exactly as it already does when the trigger or the
underlying buying event goes.

Revision ID: c9f4a2e8b1d3
Revises: b8e3d1f7a2c9
Create Date: 2026-07-30 12:30:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c9f4a2e8b1d3'
down_revision: Union[str, None] = 'b8e3d1f7a2c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("trigger_event_company_id_fkey", "trigger_event", type_="foreignkey")
    op.create_foreign_key(
        "trigger_event_company_id_fkey",
        "trigger_event",
        "company",
        ["company_id"],
        ["company_id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("trigger_event_company_id_fkey", "trigger_event", type_="foreignkey")
    op.create_foreign_key(
        "trigger_event_company_id_fkey",
        "trigger_event",
        "company",
        ["company_id"],
        ["company_id"],
    )
