"""add reasoning / recency / p_score / deal_tier cols to lead_score

Revision ID: e8a3c1f6b4d9
Revises: d5f2b8a1c9e3
Create Date: 2026-07-22 00:00:00.000000

Additive only - existing columns (gate_check_*, d1_pain_acuity..d7_competitive,
component_score, p_convert, expected_deal_value_usd, lead_score) are kept so
the current frontend keeps rendering. These new columns hold the enhanced
engine's outputs: the three Gemini reasoning strings, the math recency factor,
the readiness sub-score, and the fixed deal tier.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e8a3c1f6b4d9'
down_revision: Union[str, None] = 'd5f2b8a1c9e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lead_score', sa.Column('d1_reasoning', sa.Text(), nullable=True))
    op.add_column('lead_score', sa.Column('d2_reasoning', sa.Text(), nullable=True))
    op.add_column('lead_score', sa.Column('d5_reasoning', sa.Text(), nullable=True))
    op.add_column('lead_score', sa.Column('recency_factor', sa.Numeric(4, 3), nullable=True))
    op.add_column('lead_score', sa.Column('p_score', sa.Numeric(5, 2), nullable=True))
    op.add_column('lead_score', sa.Column('deal_tier', sa.Numeric(5, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('lead_score', 'deal_tier')
    op.drop_column('lead_score', 'p_score')
    op.drop_column('lead_score', 'recency_factor')
    op.drop_column('lead_score', 'd5_reasoning')
    op.drop_column('lead_score', 'd2_reasoning')
    op.drop_column('lead_score', 'd1_reasoning')
