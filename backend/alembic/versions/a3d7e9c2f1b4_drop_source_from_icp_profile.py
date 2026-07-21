"""drop source from icp_profile

Revision ID: a3d7e9c2f1b4
Revises: f2a6c8e1b3d7
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a3d7e9c2f1b4'
down_revision: Union[str, None] = 'f2a6c8e1b3d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('icp_profile', 'source')


def downgrade() -> None:
    op.add_column(
        'icp_profile',
        sa.Column('source', sa.Text(), nullable=False, server_default='manual'),
    )
