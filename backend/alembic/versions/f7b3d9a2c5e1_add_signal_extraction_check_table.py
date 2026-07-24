"""add signal_extraction_check table

Revision ID: f7b3d9a2c5e1
Revises: e8a3c1f6b4d9
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f7b3d9a2c5e1'
down_revision: Union[str, None] = 'e8a3c1f6b4d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'signal_extraction_check',
        sa.Column('original_source', sa.Text(), nullable=False),
        sa.Column('checked_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('original_source'),
    )


def downgrade() -> None:
    op.drop_table('signal_extraction_check')
