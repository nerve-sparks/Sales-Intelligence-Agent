"""company_import_batch membership table, import-batch operational fields,
buying_event public-budget + staleness fields, and a safe prior-migration
downgrade guard.

Revision ID: f4a1b8c2d9e6
Revises: e7d2c9a4f1b8
Create Date: 2026-07-27 12:00:00.000000

Brief items 5, 10, 18, 20, 21.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f4a1b8c2d9e6'
down_revision: Union[str, None] = 'e7d2c9a4f1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- company_import_batch: permanent M:N import membership (item 5) -------
    op.create_table(
        'company_import_batch',
        sa.Column('company_import_batch_id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('import_batch_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['company.company_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['import_batch_id'], ['icp_import_batch.import_batch_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('company_import_batch_id'),
        sa.UniqueConstraint('company_id', 'import_batch_id', name='company_import_batch_unique'),
    )
    op.create_index('idx_company_import_batch_company', 'company_import_batch', ['company_id'])
    op.create_index('idx_company_import_batch_batch', 'company_import_batch', ['import_batch_id'])

    # Backfill membership from the existing single-column relationship so
    # historical companies keep their batch association.
    op.execute(
        """
        INSERT INTO company_import_batch (company_id, import_batch_id)
        SELECT company_id, import_batch_id FROM company
        WHERE import_batch_id IS NOT NULL
        ON CONFLICT (company_id, import_batch_id) DO NOTHING
        """
    )

    # --- icp_import_batch operational fields (item 21) -----------------------
    op.add_column('icp_import_batch', sa.Column('research_status', sa.Text(), server_default='pending', nullable=False))
    for name in ('companies_researched', 'research_failure_count', 'llm_failure_count', 'scoring_failure_count'):
        op.add_column('icp_import_batch', sa.Column(name, sa.Integer(), server_default='0', nullable=False))
    op.add_column('icp_import_batch', sa.Column('processing_started_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('icp_import_batch', sa.Column('processing_completed_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('icp_import_batch', sa.Column('processing_error', sa.Text(), nullable=True))
    op.add_column('icp_import_batch', sa.Column('processing_warnings', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # --- buying_event public-budget (item 18) + staleness (item 10) ----------
    op.add_column('buying_event', sa.Column('public_budget_usd', sa.Numeric(15, 2), nullable=True))
    op.add_column('buying_event', sa.Column('budget_currency', sa.Text(), nullable=True))
    op.add_column('buying_event', sa.Column('budget_source_url', sa.Text(), nullable=True))
    op.add_column('buying_event', sa.Column('budget_confidence', sa.Text(), nullable=True))
    op.add_column('buying_event', sa.Column('first_seen_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.add_column('buying_event', sa.Column('last_seen_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True))
    op.add_column('buying_event', sa.Column('research_run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('buying_event', sa.Column('is_stale', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('buying_event', 'is_stale')
    op.drop_column('buying_event', 'research_run_id')
    op.drop_column('buying_event', 'last_seen_at')
    op.drop_column('buying_event', 'first_seen_at')
    op.drop_column('buying_event', 'budget_confidence')
    op.drop_column('buying_event', 'budget_source_url')
    op.drop_column('buying_event', 'budget_currency')
    op.drop_column('buying_event', 'public_budget_usd')

    op.drop_column('icp_import_batch', 'processing_warnings')
    op.drop_column('icp_import_batch', 'processing_error')
    op.drop_column('icp_import_batch', 'processing_completed_at')
    op.drop_column('icp_import_batch', 'processing_started_at')
    for name in ('scoring_failure_count', 'llm_failure_count', 'research_failure_count', 'companies_researched'):
        op.drop_column('icp_import_batch', name)
    op.drop_column('icp_import_batch', 'research_status')

    op.drop_index('idx_company_import_batch_batch', table_name='company_import_batch')
    op.drop_index('idx_company_import_batch_company', table_name='company_import_batch')
    op.drop_table('company_import_batch')
