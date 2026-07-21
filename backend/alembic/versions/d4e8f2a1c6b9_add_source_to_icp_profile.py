"""add source to icp_profile

Revision ID: d4e8f2a1c6b9
Revises: b3f7c9d1a4e6
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4e8f2a1c6b9'
down_revision: Union[str, None] = 'b3f7c9d1a4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'icp_profile',
        sa.Column('source', sa.Text(), nullable=False, server_default='manual'),
    )


def downgrade() -> None:
    op.drop_column('icp_profile', 'source')
