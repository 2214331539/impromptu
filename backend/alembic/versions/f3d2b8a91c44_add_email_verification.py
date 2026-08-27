"""add email verification

Revision ID: f3d2b8a91c44
Revises: e7a6c1d4f920
Create Date: 2026-08-27 11:20:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f3d2b8a91c44"
down_revision: Union[str, None] = "e7a6c1d4f920"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(length=255), nullable=True))
        batch_op.add_column(
            sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.create_index("ix_users_email", ["email"], unique=True)

    connection = op.get_bind()
    for account, email in (
        ("A1001", "admin@impromptu.local"),
        ("T1001", "teacher@impromptu.local"),
        ("250001", "student1@impromptu.local"),
        ("250002", "student2@impromptu.local"),
    ):
        conflict = connection.execute(
            sa.text("SELECT 1 FROM users WHERE email = :email"),
            {"email": email},
        ).first()
        if not conflict:
            connection.execute(
                sa.text(
                    "UPDATE users SET email = :email, email_verified = true "
                    "WHERE student_no = :account AND email IS NULL"
                ),
                {"email": email, "account": account},
            )

    op.create_table(
        "email_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("account", sa.String(length=32), nullable=True),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_codes_email", "email_codes", ["email"], unique=False)
    op.create_index("ix_email_codes_account", "email_codes", ["account"], unique=False)
    op.create_index("ix_email_codes_purpose", "email_codes", ["purpose"], unique=False)
    op.create_index("ix_email_codes_expires_at", "email_codes", ["expires_at"], unique=False)
    op.create_index(
        "ix_email_codes_email_purpose_created",
        "email_codes",
        ["email", "purpose", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_codes_email_purpose_created", table_name="email_codes")
    op.drop_index("ix_email_codes_expires_at", table_name="email_codes")
    op.drop_index("ix_email_codes_purpose", table_name="email_codes")
    op.drop_index("ix_email_codes_account", table_name="email_codes")
    op.drop_index("ix_email_codes_email", table_name="email_codes")
    op.drop_table("email_codes")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_email")
        batch_op.drop_column("email_verified")
        batch_op.drop_column("email")
