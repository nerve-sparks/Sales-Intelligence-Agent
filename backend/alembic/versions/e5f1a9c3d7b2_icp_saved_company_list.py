"""icp_import_batch.criteria_hash: one saved company list per ICP

A generated batch records the fingerprint of the ICP criteria it was run
with. Batches matching the ICP's current criteria are that ICP's saved list,
so "Find companies" returns the same companies instead of new ones each time.

Revision ID: e5f1a9c3d7b2
Revises: d2e8f4a6b1c3
Create Date: 2026-10-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5f1a9c3d7b2'
down_revision: Union[str, None] = 'd2e8f4a6b1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('icp_import_batch', sa.Column('criteria_hash', sa.Text(), nullable=True))
    op.create_index('idx_icp_import_batch_icp_criteria', 'icp_import_batch', ['icp_id', 'criteria_hash'])


def downgrade() -> None:
    op.drop_index('idx_icp_import_batch_icp_criteria', table_name='icp_import_batch')
    op.drop_column('icp_import_batch', 'criteria_hash')
