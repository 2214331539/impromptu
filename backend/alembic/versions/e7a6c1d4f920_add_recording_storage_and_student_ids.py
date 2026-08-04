"""add recording storage provider and normalize demo student ids

Revision ID: e7a6c1d4f920
Revises: c4d7e9f2a611
Create Date: 2026-08-04 16:35:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e7a6c1d4f920"
down_revision: Union[str, None] = "c4d7e9f2a611"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("recordings") as batch_op:
        batch_op.add_column(
            sa.Column("storage_provider", sa.String(length=16), nullable=False, server_default="local")
        )

    connection = op.get_bind()
    for previous, current in (("S2025001", "250001"), ("S2025002", "250002")):
        conflict = connection.execute(
            sa.text("SELECT 1 FROM users WHERE student_no = :student_no"),
            {"student_no": current},
        ).first()
        if not conflict:
            connection.execute(
                sa.text("UPDATE users SET student_no = :current WHERE student_no = :previous"),
                {"current": current, "previous": previous},
            )


def downgrade() -> None:
    connection = op.get_bind()
    for previous, current in (("S2025001", "250001"), ("S2025002", "250002")):
        conflict = connection.execute(
            sa.text("SELECT 1 FROM users WHERE student_no = :student_no"),
            {"student_no": previous},
        ).first()
        if not conflict:
            connection.execute(
                sa.text("UPDATE users SET student_no = :previous WHERE student_no = :current"),
                {"previous": previous, "current": current},
            )

    with op.batch_alter_table("recordings") as batch_op:
        batch_op.drop_column("storage_provider")
