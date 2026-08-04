"""add research phase and timing

Revision ID: c4d7e9f2a611
Revises: b18f4c9a2d71
Create Date: 2026-08-04 14:20:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4d7e9f2a611"
down_revision: Union[str, None] = "b18f4c9a2d71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("training_tasks") as batch_op:
        batch_op.add_column(
            sa.Column("research_seconds", sa.Integer(), nullable=False, server_default="900")
        )
        batch_op.create_check_constraint("ck_task_research_positive", "research_seconds > 0")

    with op.batch_alter_table("training_sessions") as batch_op:
        batch_op.alter_column(
            "phase",
            existing_type=sa.String(length=9),
            type_=sa.String(length=11),
            existing_nullable=False,
        )
        batch_op.add_column(sa.Column("research_started_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("research_ends_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.execute("UPDATE training_sessions SET phase = 'DRAWING' WHERE phase = 'RESEARCHING'")
    with op.batch_alter_table("training_sessions") as batch_op:
        batch_op.drop_column("research_ends_at")
        batch_op.drop_column("research_started_at")
        batch_op.alter_column(
            "phase",
            existing_type=sa.String(length=11),
            type_=sa.String(length=9),
            existing_nullable=False,
        )

    with op.batch_alter_table("training_tasks") as batch_op:
        batch_op.drop_constraint("ck_task_research_positive", type_="check")
        batch_op.drop_column("research_seconds")
