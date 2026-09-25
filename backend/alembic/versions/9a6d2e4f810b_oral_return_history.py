"""Preserve oral submission return history and grant extra recording attempts."""
from alembic import op
import sqlalchemy as sa

revision = "9a6d2e4f810b"
down_revision = "7f4c3b2a91d5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("training_sessions", sa.Column("return_history", sa.JSON(), nullable=False, server_default="[]"))


def downgrade():
    op.drop_column("training_sessions", "return_history")
