"""add writing module

Revision ID: 7f4c3b2a91d5
Revises: f3d2b8a91c44
Create Date: 2026-09-18 12:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "7f4c3b2a91d5"
down_revision: Union[str, None] = "f3d2b8a91c44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "writing_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("DRAFT", "PUBLISHED", "CLOSED", name="writingassignmentstatus", native_enum=False),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("min_words", sa.Integer(), nullable=False),
        sa.Column("max_words", sa.Integer(), nullable=True),
        sa.Column(
            "grammar_hint_mode",
            sa.Enum("OFF", "AFTER_SUBMIT", name="writinggrammarhintmode", native_enum=False),
            nullable=False,
        ),
        sa.Column("revision_limit", sa.Integer(), nullable=False),
        sa.Column("allow_late_submission", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("min_words >= 0", name="ck_writing_assignment_min_words"),
        sa.CheckConstraint("max_words IS NULL OR max_words > 0", name="ck_writing_assignment_max_words"),
        sa.CheckConstraint("revision_limit >= 0", name="ck_writing_assignment_revision_limit"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_writing_assignments_class_status", "writing_assignments", ["class_id", "status"], unique=False)
    op.create_index(op.f("ix_writing_assignments_class_id"), "writing_assignments", ["class_id"], unique=False)
    op.create_index(op.f("ix_writing_assignments_due_at"), "writing_assignments", ["due_at"], unique=False)
    op.create_index(op.f("ix_writing_assignments_starts_at"), "writing_assignments", ["starts_at"], unique=False)
    op.create_index(op.f("ix_writing_assignments_status"), "writing_assignments", ["status"], unique=False)
    op.create_index(op.f("ix_writing_assignments_teacher_id"), "writing_assignments", ["teacher_id"], unique=False)

    op.create_table(
        "writing_submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("DRAFTING", "REVISING", "FINALIZED", name="writingsubmissionstatus", native_enum=False),
            nullable=False,
        ),
        sa.Column("draft_content", sa.Text(), nullable=False),
        sa.Column("draft_word_count", sa.Integer(), nullable=False),
        sa.Column("draft_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("final_submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("latest_revision_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["writing_assignments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id", "student_id", name="uq_writing_assignment_student"),
    )
    op.create_index("ix_writing_submissions_assignment_status", "writing_submissions", ["assignment_id", "status"], unique=False)
    op.create_index(op.f("ix_writing_submissions_assignment_id"), "writing_submissions", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_writing_submissions_status"), "writing_submissions", ["status"], unique=False)
    op.create_index(op.f("ix_writing_submissions_student_id"), "writing_submissions", ["student_id"], unique=False)

    op.create_table(
        "writing_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("client_submit_id", sa.String(length=64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column(
            "grammar_status",
            sa.Enum(
                "NOT_APPLICABLE",
                "PENDING",
                "COMPLETED",
                "FAILED",
                name="writinggrammarstatus",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("grammar_issue_count", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision_number >= 0", name="ck_writing_revision_number"),
        sa.ForeignKeyConstraint(["submission_id"], ["writing_submissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "client_submit_id", name="uq_writing_revision_client_submit"),
        sa.UniqueConstraint("submission_id", "revision_number", name="uq_writing_revision_number"),
    )
    op.create_index(op.f("ix_writing_revisions_grammar_status"), "writing_revisions", ["grammar_status"], unique=False)
    op.create_index(op.f("ix_writing_revisions_submission_id"), "writing_revisions", ["submission_id"], unique=False)
    op.create_index(op.f("ix_writing_revisions_submitted_at"), "writing_revisions", ["submitted_at"], unique=False)

    op.create_foreign_key(
        "fk_writing_submission_latest_revision",
        "writing_submissions",
        "writing_revisions",
        ["latest_revision_id"],
        ["id"],
    )

    op.create_table(
        "writing_grammar_issues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("revision_id", sa.Integer(), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("segment_id", sa.String(length=64), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("message", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("start_offset >= 0", name="ck_writing_issue_start"),
        sa.CheckConstraint("end_offset > start_offset", name="ck_writing_issue_end"),
        sa.ForeignKeyConstraint(["revision_id"], ["writing_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_writing_issues_revision_start", "writing_grammar_issues", ["revision_id", "start_offset"], unique=False)
    op.create_index(op.f("ix_writing_grammar_issues_revision_id"), "writing_grammar_issues", ["revision_id"], unique=False)

    op.create_table(
        "writing_presence_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("client_visit_id", sa.String(length=64), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_reason", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submission_id"], ["writing_submissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "client_visit_id", name="uq_writing_visit_client"),
    )
    op.create_index("ix_writing_visits_submission_started", "writing_presence_visits", ["submission_id", "started_at"], unique=False)
    op.create_index(op.f("ix_writing_presence_visits_student_id"), "writing_presence_visits", ["student_id"], unique=False)
    op.create_index(op.f("ix_writing_presence_visits_submission_id"), "writing_presence_visits", ["submission_id"], unique=False)

    op.create_table(
        "writing_integrity_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("detail", sa.String(length=255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submission_id"], ["writing_submissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_writing_integrity_events_occurred_at"), "writing_integrity_events", ["occurred_at"], unique=False)
    op.create_index(op.f("ix_writing_integrity_events_student_id"), "writing_integrity_events", ["student_id"], unique=False)
    op.create_index(op.f("ix_writing_integrity_events_submission_id"), "writing_integrity_events", ["submission_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_writing_integrity_events_submission_id"), table_name="writing_integrity_events")
    op.drop_index(op.f("ix_writing_integrity_events_student_id"), table_name="writing_integrity_events")
    op.drop_index(op.f("ix_writing_integrity_events_occurred_at"), table_name="writing_integrity_events")
    op.drop_table("writing_integrity_events")

    op.drop_index(op.f("ix_writing_presence_visits_submission_id"), table_name="writing_presence_visits")
    op.drop_index(op.f("ix_writing_presence_visits_student_id"), table_name="writing_presence_visits")
    op.drop_index("ix_writing_visits_submission_started", table_name="writing_presence_visits")
    op.drop_table("writing_presence_visits")

    op.drop_index(op.f("ix_writing_grammar_issues_revision_id"), table_name="writing_grammar_issues")
    op.drop_index("ix_writing_issues_revision_start", table_name="writing_grammar_issues")
    op.drop_table("writing_grammar_issues")

    op.drop_constraint("fk_writing_submission_latest_revision", "writing_submissions", type_="foreignkey")
    op.drop_index(op.f("ix_writing_revisions_submitted_at"), table_name="writing_revisions")
    op.drop_index(op.f("ix_writing_revisions_submission_id"), table_name="writing_revisions")
    op.drop_index(op.f("ix_writing_revisions_grammar_status"), table_name="writing_revisions")
    op.drop_table("writing_revisions")

    op.drop_index(op.f("ix_writing_submissions_student_id"), table_name="writing_submissions")
    op.drop_index(op.f("ix_writing_submissions_status"), table_name="writing_submissions")
    op.drop_index(op.f("ix_writing_submissions_assignment_id"), table_name="writing_submissions")
    op.drop_index("ix_writing_submissions_assignment_status", table_name="writing_submissions")
    op.drop_table("writing_submissions")

    op.drop_index(op.f("ix_writing_assignments_teacher_id"), table_name="writing_assignments")
    op.drop_index(op.f("ix_writing_assignments_status"), table_name="writing_assignments")
    op.drop_index(op.f("ix_writing_assignments_starts_at"), table_name="writing_assignments")
    op.drop_index(op.f("ix_writing_assignments_due_at"), table_name="writing_assignments")
    op.drop_index(op.f("ix_writing_assignments_class_id"), table_name="writing_assignments")
    op.drop_index("ix_writing_assignments_class_status", table_name="writing_assignments")
    op.drop_table("writing_assignments")
