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

from app.db.base import Base, TimestampMixin


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


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('STUDENT', 'TEACHER', 'ADMIN')", name="ck_users_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_no: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, native_enum=False), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    owned_classes: Mapped[list["ClassRoom"]] = relationship(back_populates="teacher")
    memberships: Mapped[list["ClassMember"]] = relationship(back_populates="student")


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
