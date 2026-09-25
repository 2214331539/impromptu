from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, utc_now


class UserRole(StrEnum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


class TaskStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class SessionPhase(StrEnum):
    MIC_CHECK = "mic_check"
    DRAWING = "drawing"
    RESEARCHING = "researching"
    PREPARING = "preparing"
    SPEAKING = "speaking"
    REVIEW = "review"
    SUBMITTED = "submitted"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class WritingAssignmentStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class WritingGrammarHintMode(StrEnum):
    OFF = "off"
    AFTER_SUBMIT = "after_submit"


class WritingSubmissionStatus(StrEnum):
    DRAFTING = "drafting"
    REVISING = "revising"
    FINALIZED = "finalized"


class WritingGrammarStatus(StrEnum):
    NOT_APPLICABLE = "not_applicable"
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('STUDENT', 'TEACHER', 'ADMIN')", name="ck_users_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, native_enum=False), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    owned_classes: Mapped[list["ClassRoom"]] = relationship(back_populates="teacher")
    memberships: Mapped[list["ClassMember"]] = relationship(back_populates="student")


class EmailCode(Base, TimestampMixin):
    __tablename__ = "email_codes"
    __table_args__ = (
        Index("ix_email_codes_email_purpose_created", "email", "purpose", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    account: Mapped[str | None] = mapped_column(String(32), index=True)
    purpose: Mapped[str] = mapped_column(String(32), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ClassRoom(Base, TimestampMixin):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    invite_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    teacher: Mapped[User] = relationship(back_populates="owned_classes")
    members: Mapped[list["ClassMember"]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["TrainingTask"]] = relationship(back_populates="classroom")


class ClassMember(Base, TimestampMixin):
    __tablename__ = "class_members"
    __table_args__ = (UniqueConstraint("class_id", "student_id", name="uq_class_student"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    classroom: Mapped[ClassRoom] = relationship(back_populates="members")
    student: Mapped[User] = relationship(back_populates="memberships")


class TopicBank(Base, TimestampMixin):
    __tablename__ = "topic_banks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    topics: Mapped[list["Topic"]] = relationship(back_populates="bank", cascade="all, delete-orphan")


class Topic(Base, TimestampMixin):
    __tablename__ = "topics"
    __table_args__ = (
        Index("ix_topics_bank_active", "bank_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("topic_banks.id", ondelete="CASCADE"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), index=True)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, native_enum=False), index=True)
    tags: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    bank: Mapped[TopicBank] = relationship(back_populates="topics")


class TrainingTask(Base, TimestampMixin):
    __tablename__ = "training_tasks"
    __table_args__ = (
        CheckConstraint("research_seconds > 0", name="ck_task_research_positive"),
        CheckConstraint("preparation_seconds > 0", name="ck_task_preparation_positive"),
        CheckConstraint("speaking_seconds > 0", name="ck_task_speaking_positive"),
        Index("ix_tasks_class_status", "class_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    topic_bank_id: Mapped[int] = mapped_column(ForeignKey("topic_banks.id"), index=True)
    research_seconds: Mapped[int] = mapped_column(Integer, default=900)
    preparation_seconds: Mapped[int] = mapped_column(Integer)
    speaking_seconds: Mapped[int] = mapped_column(Integer)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    redraw_limit: Mapped[int] = mapped_column(Integer, default=0)
    rerecord_limit: Mapped[int] = mapped_column(Integer, default=0)
    notes_required: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_early_finish: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False), default=TaskStatus.DRAFT, index=True
    )

    classroom: Mapped[ClassRoom] = relationship(back_populates="tasks")
    topic_bank: Mapped[TopicBank] = relationship()
    teacher: Mapped[User] = relationship()
    sessions: Mapped[list["TrainingSession"]] = relationship(back_populates="task")


class TrainingSession(Base, TimestampMixin):
    __tablename__ = "training_sessions"
    __table_args__ = (
        UniqueConstraint("task_id", "student_id", name="uq_task_student_session"),
        Index("ix_sessions_task_phase", "task_id", "phase"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("training_tasks.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    final_topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id"), nullable=True)
    phase: Mapped[SessionPhase] = mapped_column(
        Enum(SessionPhase, native_enum=False), default=SessionPhase.MIC_CHECK, index=True
    )
    research_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    research_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preparation_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preparation_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    speaking_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    speaking_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    speaking_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recording_attempts_started: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    self_assessment: Mapped[str] = mapped_column(Text, default="")

    task: Mapped[TrainingTask] = relationship(back_populates="sessions")
    student: Mapped[User] = relationship()
    final_topic: Mapped[Topic | None] = relationship()
    draws: Mapped[list["TopicDrawRecord"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="TopicDrawRecord.draw_number"
    )
    note: Mapped["TrainingNote | None"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    recordings: Mapped[list["Recording"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    evaluation: Mapped["Evaluation | None"] = relationship(
        back_populates="session", uselist=False, cascade="all, delete-orphan"
    )


class TopicDrawRecord(Base, TimestampMixin):
    __tablename__ = "topic_draw_records"
    __table_args__ = (
        UniqueConstraint("session_id", "draw_number", name="uq_session_draw_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("training_sessions.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"), index=True)
    draw_number: Mapped[int] = mapped_column(Integer)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)

    session: Mapped[TrainingSession] = relationship(back_populates="draws")
    topic: Mapped[Topic] = relationship()


class TrainingNote(Base, TimestampMixin):
    __tablename__ = "training_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("training_sessions.id", ondelete="CASCADE"), unique=True, index=True
    )
    content: Mapped[str] = mapped_column(Text, default="")
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    session: Mapped[TrainingSession] = relationship(back_populates="note")


class Recording(Base, TimestampMixin):
    __tablename__ = "recordings"
    __table_args__ = (UniqueConstraint("session_id", "attempt_number", name="uq_recording_attempt"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("training_sessions.id", ondelete="CASCADE"), index=True)
    storage_provider: Mapped[str] = mapped_column(String(16), default="local")
    file_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    attempt_number: Mapped[int] = mapped_column(Integer)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=True)

    session: Mapped[TrainingSession] = relationship(back_populates="recordings")


class Evaluation(Base, TimestampMixin):
    __tablename__ = "evaluations"
    __table_args__ = (
        CheckConstraint("content_accuracy BETWEEN 0 AND 20", name="ck_eval_content"),
        CheckConstraint("logical_structure BETWEEN 0 AND 20", name="ck_eval_logic"),
        CheckConstraint("fluency BETWEEN 0 AND 20", name="ck_eval_fluency"),
        CheckConstraint("vocabulary BETWEEN 0 AND 20", name="ck_eval_vocabulary"),
        CheckConstraint("time_control BETWEEN 0 AND 20", name="ck_eval_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("training_sessions.id", ondelete="CASCADE"), unique=True, index=True
    )
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    content_accuracy: Mapped[int] = mapped_column(Integer)
    logical_structure: Mapped[int] = mapped_column(Integer)
    fluency: Mapped[int] = mapped_column(Integer)
    vocabulary: Mapped[int] = mapped_column(Integer)
    time_control: Mapped[int] = mapped_column(Integer)
    total_score: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    session: Mapped[TrainingSession] = relationship(back_populates="evaluation")
    teacher: Mapped[User] = relationship()


class WritingAssignment(Base, TimestampMixin):
    __tablename__ = "writing_assignments"
    __table_args__ = (
        CheckConstraint("min_words >= 0", name="ck_writing_assignment_min_words"),
        CheckConstraint("max_words IS NULL OR max_words > 0", name="ck_writing_assignment_max_words"),
        CheckConstraint("revision_limit >= 0", name="ck_writing_assignment_revision_limit"),
        Index("ix_writing_assignments_class_status", "class_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    instructions: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[WritingAssignmentStatus] = mapped_column(
        Enum(WritingAssignmentStatus, native_enum=False),
        default=WritingAssignmentStatus.DRAFT,
        index=True,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    min_words: Mapped[int] = mapped_column(Integer, default=0)
    max_words: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grammar_hint_mode: Mapped[WritingGrammarHintMode] = mapped_column(
        Enum(WritingGrammarHintMode, native_enum=False),
        default=WritingGrammarHintMode.OFF,
    )
    revision_limit: Mapped[int] = mapped_column(Integer, default=1)
    allow_late_submission: Mapped[bool] = mapped_column(Boolean, default=False)

    classroom: Mapped[ClassRoom] = relationship()
    teacher: Mapped[User] = relationship()
    submissions: Mapped[list["WritingSubmission"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )


class WritingSubmission(Base, TimestampMixin):
    __tablename__ = "writing_submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_writing_assignment_student"),
        Index("ix_writing_submissions_assignment_status", "assignment_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("writing_assignments.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[WritingSubmissionStatus] = mapped_column(
        Enum(WritingSubmissionStatus, native_enum=False),
        default=WritingSubmissionStatus.DRAFTING,
        index=True,
    )
    draft_content: Mapped[str] = mapped_column(Text, default="")
    draft_word_count: Mapped[int] = mapped_column(Integer, default=0)
    draft_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    first_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    latest_revision_id: Mapped[int | None] = mapped_column(
        ForeignKey("writing_revisions.id", use_alter=True, name="fk_writing_submission_latest_revision"),
        nullable=True,
    )

    assignment: Mapped[WritingAssignment] = relationship(back_populates="submissions")
    student: Mapped[User] = relationship()
    revisions: Mapped[list["WritingRevision"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="WritingRevision.revision_number",
        foreign_keys="WritingRevision.submission_id",
    )
    visits: Mapped[list["WritingPresenceVisit"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )
    integrity_events: Mapped[list["WritingIntegrityEvent"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )


class WritingRevision(Base, TimestampMixin):
    __tablename__ = "writing_revisions"
    __table_args__ = (
        UniqueConstraint("submission_id", "revision_number", name="uq_writing_revision_number"),
        UniqueConstraint("submission_id", "client_submit_id", name="uq_writing_revision_client_submit"),
        CheckConstraint("revision_number >= 0", name="ck_writing_revision_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("writing_submissions.id", ondelete="CASCADE"), index=True
    )
    revision_number: Mapped[int] = mapped_column(Integer)
    client_submit_id: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer)
    grammar_status: Mapped[WritingGrammarStatus] = mapped_column(
        Enum(WritingGrammarStatus, native_enum=False),
        default=WritingGrammarStatus.PENDING,
        index=True,
    )
    grammar_issue_count: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    submission: Mapped[WritingSubmission] = relationship(
        back_populates="revisions", foreign_keys="WritingRevision.submission_id"
    )
    issues: Mapped[list["WritingGrammarIssue"]] = relationship(
        back_populates="revision", cascade="all, delete-orphan"
    )


class WritingGrammarIssue(Base, TimestampMixin):
    __tablename__ = "writing_grammar_issues"
    __table_args__ = (
        CheckConstraint("start_offset >= 0", name="ck_writing_issue_start"),
        CheckConstraint("end_offset > start_offset", name="ck_writing_issue_end"),
        Index("ix_writing_issues_revision_start", "revision_id", "start_offset"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    revision_id: Mapped[int] = mapped_column(
        ForeignKey("writing_revisions.id", ondelete="CASCADE"), index=True
    )
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    segment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(64), default="grammar")
    message: Mapped[str] = mapped_column(String(255))

    revision: Mapped[WritingRevision] = relationship(back_populates="issues")


class WritingPresenceVisit(Base, TimestampMixin):
    __tablename__ = "writing_presence_visits"
    __table_args__ = (
        UniqueConstraint("submission_id", "client_visit_id", name="uq_writing_visit_client"),
        Index("ix_writing_visits_submission_started", "submission_id", "started_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("writing_submissions.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    client_visit_id: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    end_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)

    submission: Mapped[WritingSubmission] = relationship(back_populates="visits")


class WritingIntegrityEvent(Base, TimestampMixin):
    __tablename__ = "writing_integrity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(
        ForeignKey("writing_submissions.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32))
    detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    submission: Mapped[WritingSubmission] = relationship(back_populates="integrity_events")
