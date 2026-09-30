"""add auto_generated to icp_profile

Marks the Starter ICP the system creates for a new organisation, so it can be
enriched once the Offering Profile arrives - and never again after the user
edits it (update_icp clears the flag).

Revision ID: b5e2d8f1c3a7
Revises: a3f8d21c6b94
Create Date: 2026-09-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b5e2d8f1c3a7'
down_revision: Union[str, None] = 'a3f8d21c6b94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'icp_profile',
        sa.Column('auto_generated', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    # Starter ICPs created before this column existed (the first version was
    # always named exactly "Starter ICP"): flag the ones nobody has edited
    # yet - update_icp stamps updated_at, so an untouched row still has
    # updated_at == created_at.
    op.execute(
        "UPDATE icp_profile SET auto_generated = true "
        "WHERE name = 'Starter ICP' AND updated_at = created_at"
    )


def downgrade() -> None:
    op.drop_column('icp_profile', 'auto_generated')
