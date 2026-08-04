"""add admin role constraint

Revision ID: b18f4c9a2d71
Revises: 39863728b93d
Create Date: 2026-08-04 13:10:00
"""
from typing import Sequence, Union

from alembic import op


revision: str = "b18f4c9a2d71"
down_revision: Union[str, None] = "39863728b93d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_check_constraint(
            "ck_users_role",
            "role IN ('STUDENT', 'TEACHER', 'ADMIN')",
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_role", type_="check")
