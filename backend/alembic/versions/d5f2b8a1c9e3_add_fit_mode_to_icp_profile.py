"""add fit_mode to icp_profile

Revision ID: d5f2b8a1c9e3
Revises: c1d9a4e6f8b2
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd5f2b8a1c9e3'
down_revision: Union[str, None] = 'c1d9a4e6f8b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'icp_profile',
        sa.Column('fit_mode', sa.Text(), nullable=False, server_default='flexible'),
    )
    op.create_check_constraint(
        'icp_profile_fit_mode_check',
        'icp_profile',
        "fit_mode IN ('strict', 'flexible')",
    )


def downgrade() -> None:
    op.drop_constraint('icp_profile_fit_mode_check', 'icp_profile', type_='check')
    op.drop_column('icp_profile', 'fit_mode')
