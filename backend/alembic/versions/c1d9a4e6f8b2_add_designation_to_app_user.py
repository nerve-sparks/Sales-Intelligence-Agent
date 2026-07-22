"""add designation to app_user

Revision ID: c1d9a4e6f8b2
Revises: a3d7e9c2f1b4
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c1d9a4e6f8b2'
down_revision: Union[str, None] = 'a3d7e9c2f1b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('app_user', sa.Column('designation', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('app_user', 'designation')
