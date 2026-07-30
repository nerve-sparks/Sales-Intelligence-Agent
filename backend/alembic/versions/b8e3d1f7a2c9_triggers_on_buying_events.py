"""Repoint triggers at the evidence pipeline (buying_event) and recalibrate
their criteria to category + minimum event_score.

Why: trigger_matcher.detect_trigger_events matched the legacy `signal` table,
which nothing populates anymore (the evidence pipeline writes buying_event) -
verified live: signal rows stopped at 2026-07-24 while buying_event runs from
2026-07-26 on, so every trigger created after the pipeline rebuild silently
matched zero recent events. trigger_event.signal_id's FK to signal made it
impossible to reference a BuyingEvent at all.

Also drops trigger_definition.signal_types: those values came from
signal_extractor.py's old SIGNAL_CATEGORY_MAP (rfp_published, ceo_change,
ai_engineer_job_posting, ...), a vocabulary the evidence pipeline never
produces - BuyingEvent.event_type uses scoring_config.BASE_STRENGTH's values
instead (vendor_evaluation, relevant_ai_hiring, active_pilot, ...). Keeping
the column would leave a picker whose selections can never match. Criteria are
now signal_categories (the six real BuyingEvent.category values, shared with
the scoring pipeline) plus min_event_score (the real computed event_score).

DESTRUCTIVE: existing trigger_event rows all reference legacy signal rows and
cannot be remapped to buying_events (no correspondence exists between the two
tables' rows), so they are deleted. Existing trigger_definition rows are kept
but their signal_types criteria are dropped - a trigger that only had
signal_types set will match nothing until edited to pick categories, which is
already true today, just now visible instead of silent.

Revision ID: b8e3d1f7a2c9
Revises: a1b2c3d4e5f6
Create Date: 2026-07-30 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b8e3d1f7a2c9'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Stale matches against the dead signal table - no buying_event equivalent
    # to remap them onto, and they are what makes the UI show phantom counts.
    op.execute("DELETE FROM trigger_event")

    op.drop_constraint("trigger_event_trigger_signal_key", "trigger_event", type_="unique")
    op.drop_column("trigger_event", "signal_id")
    op.add_column(
        "trigger_event",
        sa.Column("buying_event_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_foreign_key(
        "trigger_event_buying_event_id_fkey",
        "trigger_event",
        "buying_event",
        ["buying_event_id"],
        ["buying_event_id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "trigger_event_trigger_buying_event_key",
        "trigger_event",
        ["trigger_id", "buying_event_id"],
    )

    op.drop_column("trigger_definition", "signal_types")
    op.add_column(
        "trigger_definition",
        sa.Column("min_event_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "trigger_definition",
        sa.Column("last_seen_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trigger_definition", "last_seen_at")
    op.drop_column("trigger_definition", "min_event_score")
    op.add_column(
        "trigger_definition",
        sa.Column("signal_types", postgresql.ARRAY(sa.Text()), nullable=True),
    )

    op.execute("DELETE FROM trigger_event")
    op.drop_constraint("trigger_event_trigger_buying_event_key", "trigger_event", type_="unique")
    op.drop_constraint("trigger_event_buying_event_id_fkey", "trigger_event", type_="foreignkey")
    op.drop_column("trigger_event", "buying_event_id")
    op.add_column("trigger_event", sa.Column("signal_id", postgresql.UUID(as_uuid=True), nullable=False))
    op.create_foreign_key(
        "trigger_event_signal_id_fkey",
        "trigger_event",
        "signal",
        ["signal_id"],
        ["signal_id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "trigger_event_trigger_signal_key", "trigger_event", ["trigger_id", "signal_id"]
    )
