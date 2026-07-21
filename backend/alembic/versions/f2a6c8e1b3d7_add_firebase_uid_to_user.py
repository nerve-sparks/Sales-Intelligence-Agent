"""add firebase_uid to app_user

Revision ID: f2a6c8e1b3d7
Revises: e7c1a9b3f5d2
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f2a6c8e1b3d7'
down_revision: Union[str, None] = 'e7c1a9b3f5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('app_user', sa.Column('firebase_uid', sa.Text(), nullable=True))
    op.create_unique_constraint('app_user_firebase_uid_key', 'app_user', ['firebase_uid'])


def downgrade() -> None:
    op.drop_constraint('app_user_firebase_uid_key', 'app_user', type_='unique')
    op.drop_column('app_user', 'firebase_uid')
