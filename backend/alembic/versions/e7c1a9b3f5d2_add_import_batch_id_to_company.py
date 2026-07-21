"""add import_batch_id to company

Revision ID: e7c1a9b3f5d2
Revises: d4e8f2a1c6b9
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e7c1a9b3f5d2'
down_revision: Union[str, None] = 'd4e8f2a1c6b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'company',
        sa.Column('import_batch_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'company_import_batch_id_fkey',
        'company', 'icp_import_batch',
        ['import_batch_id'], ['import_batch_id'],
        ondelete='SET NULL',
    )
    op.create_index('idx_company_import_batch_id', 'company', ['import_batch_id'])


def downgrade() -> None:
    op.drop_index('idx_company_import_batch_id', table_name='company')
    op.drop_constraint('company_import_batch_id_fkey', 'company', type_='foreignkey')
    op.drop_column('company', 'import_batch_id')
