"""evidence-based pipeline: offering profile, buying_event, lead_score
evidence columns, workspace-scoped import batches

Revision ID: e7d2c9a4f1b8
Revises: c3f8e1a4d6b7
Create Date: 2026-07-27 00:00:00.000000

Replaces the ICP/gate/D1-D7 scoring data model with the evidence-based one
(brief sections 5, 7, 11, 20, 32). Legacy columns are retained (not dropped)
so historical rows stay readable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e7d2c9a4f1b8'
down_revision: Union[str, None] = 'c3f8e1a4d6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The exact existing FK on icp_import_batch.icp_id (verified against the live
# DB, not assumed - brief section 32). Currently ON DELETE CASCADE; recreated
# below as ON DELETE SET NULL since icp_id becomes nullable/legacy.
_ICP_FK = "icp_import_batch_icp_id_fkey"


def upgrade() -> None:
    # --- 1. Organisation: XSparks Offering Profile (brief section 5) ---------
    op.add_column('organisation', sa.Column('offering_profile', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('organisation', sa.Column('offering_profile_source_url', sa.Text(), nullable=True))
    op.add_column('organisation', sa.Column('offering_profile_status', sa.Text(), nullable=True))
    op.add_column('organisation', sa.Column('offering_profile_synced_at', sa.TIMESTAMP(timezone=True), nullable=True))

    # --- 2. LeadScore: evidence-based columns (brief section 20) -------------
    ls_cols = [
        sa.Column('buying_evidence_score', sa.Numeric(5, 2)),
        sa.Column('contact_access_score', sa.Numeric(5, 2)),
        sa.Column('negative_event_score', sa.Numeric(5, 2)),
        sa.Column('evidence_confidence', sa.Numeric(4, 3)),
        sa.Column('confidence_label', sa.Text()),
        sa.Column('sales_status', sa.Text()),
        sa.Column('expected_deal_min_usd', sa.Numeric(15, 2)),
        sa.Column('expected_deal_max_usd', sa.Numeric(15, 2)),
        sa.Column('expected_revenue_usd', sa.Numeric(15, 2)),
        sa.Column('best_offering', sa.Text()),
        sa.Column('why_now', sa.Text()),
        sa.Column('recommended_action', sa.Text()),
        sa.Column('evidence_summary', postgresql.JSONB(astext_type=sa.Text())),
        sa.Column('deal_value_basis', sa.Text()),
        sa.Column('deal_value_confidence', sa.Text()),
        sa.Column('commercially_viable', sa.Boolean()),
        sa.Column('score_version', sa.Numeric(6, 0)),
        sa.Column('score_formula_version', sa.Text()),
        sa.Column('scoring_warnings', postgresql.JSONB(astext_type=sa.Text())),
    ]
    for col in ls_cols:
        op.add_column('lead_score', col)

    # --- 3. buying_event: the canonical dedup layer (brief section 11) -------
    op.create_table(
        'buying_event',
        sa.Column('buying_event_id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('canonical_key', sa.Text(), nullable=False),
        sa.Column('event_type', sa.Text(), nullable=False),
        sa.Column('category', sa.Text(), nullable=True),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('evidence', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('published_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('base_strength', sa.Numeric(5, 2), nullable=True),
        sa.Column('relevance', sa.Numeric(4, 3), nullable=True),
        sa.Column('freshness', sa.Numeric(4, 3), nullable=True),
        sa.Column('source_quality', sa.Numeric(4, 3), nullable=True),
        sa.Column('extraction_confidence', sa.Numeric(4, 3), nullable=True),
        sa.Column('status_factor', sa.Numeric(4, 3), nullable=True),
        sa.Column('event_score', sa.Numeric(6, 2), nullable=True),
        sa.Column('is_negative', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('penalty_value', sa.Numeric(6, 2), nullable=True),
        sa.Column('best_offering', sa.Text(), nullable=True),
        sa.Column('reasoning', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['company.company_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('buying_event_id'),
        sa.UniqueConstraint('company_id', 'canonical_key', name='buying_event_company_canonical_key'),
    )
    op.create_index('idx_buying_event_company_id', 'buying_event', ['company_id'])

    # --- 4. icp_import_batch: workspace-scoped, ICP-optional (brief 7) -------
    op.add_column('icp_import_batch', sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=True))
    for name in ('sales_ready_count', 'high_priority_count', 'warm_count', 'monitor_count', 'low_priority_count'):
        op.add_column('icp_import_batch', sa.Column(name, sa.Integer(), server_default='0', nullable=False))

    # Backfill workspace_id for historical rows via icp_profile.workspace_id.
    op.execute(
        """
        UPDATE icp_import_batch b
        SET workspace_id = p.workspace_id
        FROM icp_profile p
        WHERE b.icp_id = p.icp_id AND b.workspace_id IS NULL
        """
    )

    op.create_foreign_key(
        'icp_import_batch_workspace_id_fkey', 'icp_import_batch', 'workspace',
        ['workspace_id'], ['workspace_id'], ondelete='CASCADE',
    )
    op.create_index('idx_icp_import_batch_workspace_id', 'icp_import_batch', ['workspace_id'])

    # icp_id: drop NOT NULL, swap the FK from CASCADE to SET NULL.
    op.alter_column('icp_import_batch', 'icp_id', existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.drop_constraint(_ICP_FK, 'icp_import_batch', type_='foreignkey')
    op.create_foreign_key(
        _ICP_FK, 'icp_import_batch', 'icp_profile',
        ['icp_id'], ['icp_id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    # Guard: restoring icp_id NOT NULL is impossible once no-ICP prospect
    # uploads exist (icp_id IS NULL). Fail with a clear, actionable message
    # rather than a raw IntegrityError (brief item 20). Operator must delete
    # those rows or backfill a placeholder ICP first.
    bind = op.get_bind()
    null_count = bind.execute(sa.text("SELECT count(*) FROM icp_import_batch WHERE icp_id IS NULL")).scalar()
    if null_count:
        raise RuntimeError(
            f"Cannot downgrade past e7d2c9a4f1b8: {null_count} import batch(es) have icp_id IS NULL "
            "(no-ICP prospect uploads). Delete those rows or backfill a placeholder ICP before "
            "downgrading, since this restores the icp_id NOT NULL constraint."
        )

    # icp_import_batch: restore CASCADE FK + NOT NULL on icp_id.
    op.drop_constraint(_ICP_FK, 'icp_import_batch', type_='foreignkey')
    op.create_foreign_key(
        _ICP_FK, 'icp_import_batch', 'icp_profile',
        ['icp_id'], ['icp_id'], ondelete='CASCADE',
    )
    op.alter_column('icp_import_batch', 'icp_id', existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_index('idx_icp_import_batch_workspace_id', table_name='icp_import_batch')
    op.drop_constraint('icp_import_batch_workspace_id_fkey', 'icp_import_batch', type_='foreignkey')
    for name in ('low_priority_count', 'monitor_count', 'warm_count', 'high_priority_count', 'sales_ready_count'):
        op.drop_column('icp_import_batch', name)
    op.drop_column('icp_import_batch', 'workspace_id')

    op.drop_index('idx_buying_event_company_id', table_name='buying_event')
    op.drop_table('buying_event')

    for name in (
        'scoring_warnings', 'score_formula_version', 'score_version', 'commercially_viable',
        'deal_value_confidence', 'deal_value_basis', 'evidence_summary', 'recommended_action',
        'why_now', 'best_offering', 'expected_revenue_usd', 'expected_deal_max_usd',
        'expected_deal_min_usd', 'sales_status', 'confidence_label', 'evidence_confidence',
        'negative_event_score', 'contact_access_score', 'buying_evidence_score',
    ):
        op.drop_column('lead_score', name)

    for name in (
        'offering_profile_synced_at', 'offering_profile_status',
        'offering_profile_source_url', 'offering_profile',
    ):
        op.drop_column('organisation', name)
