"""Per-company processing status on company_import_batch (status/
error_message/retry_count/is_permanent_failure/started_at/completed_at) and
cooperative-cancellation support on icp_import_batch (cancel_requested_at).

Backs GET .../imports/{id}/items (per-company status), POST .../retry-failed
(re-queue only failed, non-permanent companies), and POST .../cancel.

Revision ID: a1b2c3d4e5f6
Revises: f4a1b8c2d9e6
Create Date: 2026-07-27 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f4a1b8c2d9e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('company_import_batch', sa.Column('status', sa.Text(), server_default='queued', nullable=False))
    op.add_column('company_import_batch', sa.Column('error_message', sa.Text(), nullable=True))
    op.add_column('company_import_batch', sa.Column('is_permanent_failure', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('company_import_batch', sa.Column('retry_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('company_import_batch', sa.Column('started_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('company_import_batch', sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.create_check_constraint(
        'company_import_batch_status_check',
        'company_import_batch',
        "status IN ('queued', 'researching', 'scoring', 'completed', 'retrying', 'failed', 'needs_review')",
    )
    op.create_index('idx_company_import_batch_status', 'company_import_batch', ['import_batch_id', 'status'])

    # Existing rows predate per-company tracking - their batch already
    # finished (or is mid-flight from before this migration), so backfill to
    # 'completed' rather than leaving every historical row stuck at the
    # 'queued' default, which would make old batches look perpetually pending
    # in the new per-company view.
    op.execute("UPDATE company_import_batch SET status = 'completed'")

    op.add_column('icp_import_batch', sa.Column('cancel_requested_at', sa.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('icp_import_batch', 'cancel_requested_at')

    op.drop_index('idx_company_import_batch_status', table_name='company_import_batch')
    op.drop_constraint('company_import_batch_status_check', 'company_import_batch', type_='check')
    op.drop_column('company_import_batch', 'completed_at')
    op.drop_column('company_import_batch', 'started_at')
    op.drop_column('company_import_batch', 'retry_count')
    op.drop_column('company_import_batch', 'is_permanent_failure')
    op.drop_column('company_import_batch', 'error_message')
    op.drop_column('company_import_batch', 'status')
