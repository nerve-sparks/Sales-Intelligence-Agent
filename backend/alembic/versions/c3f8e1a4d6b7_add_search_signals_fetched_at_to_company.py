"""add search_signals_fetched_at to company

Revision ID: c3f8e1a4d6b7
Revises: a1c4e7f2b8d5
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c3f8e1a4d6b7'
down_revision: Union[str, None] = 'a1c4e7f2b8d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'company',
        sa.Column('search_signals_fetched_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('company', 'search_signals_fetched_at')
