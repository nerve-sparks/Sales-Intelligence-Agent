"""Add `source` to icp_import_batch: 'upload' | 'generated'.

A batch used to have exactly one origin - a person uploading a spreadsheet.
ICP-driven lead generation creates batches the same way (same job tracking,
same research + scoring, same export), so the two populations are otherwise
indistinguishable once the companies exist.

Provenance is what keeps them comparable rather than merged: the UI labels a
generated batch, and generated leads carry a known structural difference -
they arrive with no contacts, so Contact Access is 0 and their Lead Score is
capped below an uploaded company's. Without this column that difference looks
like "generated leads are worse prospects" instead of "generated leads have
not been contact-sourced yet".

DEFAULT 'upload' backfills every existing row correctly: every batch that
exists today came from a file.

Revision ID: e2b9c4f7a1d8
Revises: d1a7f3c8e5b2
Create Date: 2026-08-27 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2b9c4f7a1d8"
down_revision: Union[str, None] = "d1a7f3c8e5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "icp_import_batch",
        sa.Column("source", sa.Text(), nullable=False, server_default="upload"),
    )
    op.create_check_constraint(
        "icp_import_batch_source_check",
        "icp_import_batch",
        "source IN ('upload', 'generated')",
    )


def downgrade() -> None:
    op.drop_constraint("icp_import_batch_source_check", "icp_import_batch", type_="check")
    op.drop_column("icp_import_batch", "source")
