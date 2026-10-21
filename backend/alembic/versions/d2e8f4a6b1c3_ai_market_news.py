"""AI market news: top global AI companies, their news, global job runs

- ai_market_company: the top 50 AI companies (rebuilt via you.com + LLM).
- ai_market_news: news about them for the dashboard's Latest News card
  (global, last 30 days).
- scheduled_job_run: last run / atomic claim for global scheduled jobs.

Revision ID: d2e8f4a6b1c3
Revises: c9d4e7a1f2b6
Create Date: 2026-10-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd2e8f4a6b1c3'
down_revision: Union[str, None] = 'c9d4e7a1f2b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_market_company',
        sa.Column('ai_market_company_id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('rank', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('domain', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_table(
        'ai_market_news',
        sa.Column('ai_market_news_id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('company_name', sa.Text(), nullable=False),
        sa.Column('company_domain', sa.Text(), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('category', sa.Text(), nullable=False),
        sa.Column('url', sa.Text(), nullable=False, unique=True),
        sa.Column('source_domain', sa.Text(), nullable=True),
        sa.Column('published_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('discovered_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_ai_market_news_discovered', 'ai_market_news', ['discovered_at'])
    op.create_table(
        'scheduled_job_run',
        sa.Column('job_key', sa.Text(), primary_key=True),
        sa.Column('last_run_at', sa.TIMESTAMP(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('scheduled_job_run')
    op.drop_index('ix_ai_market_news_discovered', table_name='ai_market_news')
    op.drop_table('ai_market_news')
    op.drop_table('ai_market_company')
