"""add scoring_status to icp_import_batch

Revision ID: a1c4e7f2b8d5
Revises: f7b3d9a2c5e1
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1c4e7f2b8d5'
down_revision: Union[str, None] = 'f7b3d9a2c5e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'icp_import_batch',
        sa.Column('scoring_status', sa.Text(), server_default='complete', nullable=False),
    )
    op.create_check_constraint(
        'icp_import_batch_scoring_status_check',
        'icp_import_batch',
        "scoring_status IN ('pending', 'complete')",
    )


def downgrade() -> None:
    op.drop_constraint('icp_import_batch_scoring_status_check', 'icp_import_batch', type_='check')
    op.drop_column('icp_import_batch', 'scoring_status')
