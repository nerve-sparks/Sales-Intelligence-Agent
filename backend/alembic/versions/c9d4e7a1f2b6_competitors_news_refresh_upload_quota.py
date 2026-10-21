"""competitors, competitor news, selected-lead refresh, upload quota

- organisation.competitors / news_refreshed_at: AI-identified competitor list
  (from the Offering Profile sync) and the 48h news-refresh claim marker.
- lead_score.competitor_strength / competitor_detail: research-time competitor
  judgement shown as a badge (the penalty itself lives on buying_event).
- company.refresh_status / refresh_requested_at: progress of a "refresh
  selected" run, which is not tied to any one upload batch.
- competitor_news: news about the tenant's competitors (last 30 days only).
- upload_quota_event: per-user upload ledger behind the 2-files-per-24h limit;
  survives upload deletion on purpose.

Revision ID: c9d4e7a1f2b6
Revises: b5e2d8f1c3a7
Create Date: 2026-10-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c9d4e7a1f2b6'
down_revision: Union[str, None] = 'b5e2d8f1c3a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organisation', sa.Column('competitors', postgresql.JSONB(), nullable=True))
    op.add_column('organisation', sa.Column('news_refreshed_at', sa.TIMESTAMP(timezone=True), nullable=True))

    op.add_column('lead_score', sa.Column('competitor_strength', sa.Text(), nullable=True))
    op.add_column('lead_score', sa.Column('competitor_detail', postgresql.JSONB(), nullable=True))

    op.add_column('company', sa.Column('refresh_status', sa.Text(), nullable=True))
    op.add_column('company', sa.Column('refresh_requested_at', sa.TIMESTAMP(timezone=True), nullable=True))

    op.create_table(
        'competitor_news',
        sa.Column('competitor_news_id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('organisation_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organisation.organisation_id', ondelete='CASCADE'), nullable=False),
        sa.Column('competitor_name', sa.Text(), nullable=False),
        sa.Column('competitor_domain', sa.Text(), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('why_it_matters', sa.Text(), nullable=True),
        sa.Column('category', sa.Text(), nullable=False, server_default='other'),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('source_domain', sa.Text(), nullable=True),
        sa.Column('published_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('discovered_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('organisation_id', 'url', name='competitor_news_org_url_key'),
    )
    op.create_index('ix_competitor_news_org_discovered', 'competitor_news', ['organisation_id', 'discovered_at'])

    op.create_table(
        'upload_quota_event',
        sa.Column('upload_quota_event_id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('app_user.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workspace.workspace_id', ondelete='SET NULL'), nullable=True),
        sa.Column('file_name', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_upload_quota_event_user_created', 'upload_quota_event', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_upload_quota_event_user_created', table_name='upload_quota_event')
    op.drop_table('upload_quota_event')
    op.drop_index('ix_competitor_news_org_discovered', table_name='competitor_news')
    op.drop_table('competitor_news')
    op.drop_column('company', 'refresh_requested_at')
    op.drop_column('company', 'refresh_status')
    op.drop_column('lead_score', 'competitor_detail')
    op.drop_column('lead_score', 'competitor_strength')
    op.drop_column('organisation', 'news_refreshed_at')
    op.drop_column('organisation', 'competitors')
