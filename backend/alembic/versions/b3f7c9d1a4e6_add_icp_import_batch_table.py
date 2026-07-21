"""add icp_import_batch table

Revision ID: b3f7c9d1a4e6
Revises: 9a1c3e5f7b2d
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b3f7c9d1a4e6'
down_revision: Union[str, None] = '9a1c3e5f7b2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'icp_import_batch',
        sa.Column('import_batch_id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('icp_id', sa.UUID(), nullable=False),
        sa.Column('file_names', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('files_processed', sa.Integer(), nullable=False),
        sa.Column('total_rows', sa.Integer(), nullable=False),
        sa.Column('companies_ingested', sa.Integer(), nullable=False),
        sa.Column('signals_extracted', sa.Integer(), nullable=False),
        sa.Column('matched_icp_count', sa.Integer(), nullable=False),
        sa.Column('active_count', sa.Integer(), nullable=False),
        sa.Column('nurture_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['icp_id'], ['icp_profile.icp_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('import_batch_id'),
    )
    op.create_index('idx_icp_import_batch_icp_id', 'icp_import_batch', ['icp_id'])


def downgrade() -> None:
    op.drop_index('idx_icp_import_batch_icp_id', table_name='icp_import_batch')
    op.drop_table('icp_import_batch')
