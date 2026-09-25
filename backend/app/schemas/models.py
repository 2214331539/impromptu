from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.entities import (
    Difficulty,
    SessionPhase,
    TaskStatus,
    UserRole,
    WritingAssignmentStatus,
    WritingGrammarHintMode,
    WritingGrammarStatus,
    WritingSubmissionStatus,
)


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_validator("*", mode="after")
    @classmethod
    def utc_datetimes(cls, value):
        # SQLite omits timezone metadata; API dates must remain UTC on every backend.
        if isinstance(value, datetime):
            return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return value


class UserOut(APIModel):
    id: int
    student_no: str
    email: str | None = None
    email_verified: bool = False
    name: str
    role: UserRole


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_no: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    email_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=72)


class LoginRequest(BaseModel):
    student_no: str = Field(min_length=3, max_length=32)
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=6, max_length=72)
    new_password: str = Field(min_length=6, max_length=72)


class EmailCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    student_no: str | None = Field(default=None, min_length=3, max_length=32)


class PasswordResetCodeRequest(BaseModel):
    student_no: str = Field(min_length=3, max_length=32)
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class PasswordResetRequest(BaseModel):
    student_no: str = Field(min_length=3, max_length=32)
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    email_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=6, max_length=72)


class BindEmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    email_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class AdminUserCreate(BaseModel):
    student_no: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=72)
    role: UserRole


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: str | None = Field(default=None, min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str | None = Field(default=None, min_length=6, max_length=72)
    is_active: bool | None = None


class AdminPasswordReset(BaseModel):
    password: str = Field(min_length=6, max_length=72)


class AdminUserOut(UserOut):
    is_active: bool
    created_at: datetime


class AdminOverviewOut(BaseModel):
    metrics: dict[str, int]
    recent_users: list[AdminUserOut]


class AdminClassCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    teacher_id: int


class AdminClassUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    teacher_id: int | None = None
    is_active: bool | None = None


class AdminClassOut(APIModel):
    id: int
    name: str
    invite_code: str
    is_active: bool
    teacher_id: int
    teacher_name: str
    student_count: int = 0
    task_count: int = 0
    created_at: datetime


class ClassCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class ClassOut(APIModel):
    id: int
    name: str
    invite_code: str
    is_active: bool
    student_count: int = 0
    task_count: int = 0


class JoinClassRequest(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)


class MemberOut(APIModel):
    id: int
    student_no: str
    name: str
    completed_count: int = 0
    average_score: float | None = None


class TopicCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    category: str = Field(default="Topic", min_length=1, max_length=64)
    difficulty: Difficulty = Difficulty.MEDIUM
    tags: str = Field(default="", max_length=255)


class TopicUpdate(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=2000)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    difficulty: Difficulty | None = None
    tags: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None


class TopicOut(APIModel):
    id: int
    bank_id: int
    prompt: str
    category: str
    difficulty: Difficulty
    tags: str
    is_active: bool
    created_at: datetime


class TopicBankCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)


class TopicBankOut(APIModel):
    id: int
    name: str
    description: str
    is_active: bool
    topic_count: int = 0
    active_topic_count: int = 0


class TopicImportItem(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    category: str = Field(default="Topic", min_length=1, max_length=64)
    difficulty: Difficulty = Difficulty.MEDIUM
    tags: str = Field(default="", max_length=255)


class TopicImportPreviewOut(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    topics: list[TopicImportItem]
    warnings: list[str] = []


class TopicImportCommitRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    topics: list[TopicImportItem] = Field(min_length=1, max_length=200)


class TopicImportCommitOut(BaseModel):
    bank: TopicBankOut
    topics: list[TopicOut]


class TopicAppendRequest(BaseModel):
    topics: list[TopicCreate] = Field(min_length=1, max_length=200)


class TaskCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=3000)
    class_id: int
    topic_bank_id: int
    research_seconds: int = Field(default=900, ge=10, le=7200)
    preparation_seconds: int = Field(ge=10, le=3600)
    speaking_seconds: int = Field(ge=10, le=3600)
    starts_at: datetime
    due_at: datetime
    redraw_limit: int = Field(default=0, ge=0, le=10)
    rerecord_limit: int = Field(default=0, ge=0, le=10)
    notes_required: bool = False
    allow_early_finish: bool = True

    @model_validator(mode="after")
    def validate_dates(self):
        if self.starts_at.tzinfo is None or self.due_at.tzinfo is None:
            raise ValueError("开始时间和截止时间必须包含时区")
        if self.due_at <= self.starts_at:
            raise ValueError("截止时间必须晚于开始时间")
        self.starts_at = self.starts_at.astimezone(timezone.utc)
        self.due_at = self.due_at.astimezone(timezone.utc)
        return self


class TaskOut(APIModel):
    id: int
    name: str
    description: str
    class_id: int
    class_name: str
    topic_bank_id: int
    topic_bank_name: str
    teacher_id: int
    teacher_name: str
    research_seconds: int
    preparation_seconds: int
    speaking_seconds: int
    starts_at: datetime
    due_at: datetime
    redraw_limit: int
    rerecord_limit: int
    notes_required: bool
    allow_early_finish: bool
    status: TaskStatus
    participant_count: int = 0
    completed_count: int = 0
    completion_rate: float = 0
    my_session_id: int | None = None
    my_phase: SessionPhase | None = None


class DrawOut(BaseModel):
    id: int
    draw_number: int
    confirmed: bool
    topic: TopicOut
    redraws_remaining: int


class NoteUpdate(BaseModel):
    content: str = Field(max_length=10000)


class RecordingOut(APIModel):
    id: int
    url: str
    mime_type: str
    size_bytes: int
    duration_seconds: float
    attempt_number: int
    is_selected: bool
    download_url: str
    stream_url: str


class EvaluationCreate(BaseModel):
    content_accuracy: int = Field(ge=0, le=20)
    logical_structure: int = Field(ge=0, le=20)
    fluency: int = Field(ge=0, le=20)
    vocabulary: int = Field(ge=0, le=20)
    time_control: int = Field(ge=0, le=20)
    comment: str = Field(default="", max_length=5000)


class EvaluationOut(APIModel):
    id: int
    content_accuracy: int
    logical_structure: int
    fluency: int
    vocabulary: int
    time_control: int
    total_score: int
    comment: str
    published_at: datetime


class SessionOut(BaseModel):
    id: int
    task_id: int
    student_id: int
    student_name: str
    student_no: str
    phase: SessionPhase
    final_topic: TopicOut | None
    current_draw: DrawOut | None
    draw_count: int
    redraws_remaining: int
    research_started_at: datetime | None
    research_ends_at: datetime | None
    preparation_started_at: datetime | None
    preparation_ends_at: datetime | None
    speaking_started_at: datetime | None
    speaking_ends_at: datetime | None
    speaking_finished_at: datetime | None
    recording_attempts_started: int
    rerecords_remaining: int
    submitted_at: datetime | None
    note: str
    note_locked: bool
    self_assessment: str
    recordings: list[RecordingOut]
    evaluation: EvaluationOut | None
    task: TaskOut
    server_time: datetime


class FinishSpeakingRequest(BaseModel):
    duration_seconds: float = Field(ge=0, le=7200)


class SubmitSessionRequest(BaseModel):
    self_assessment: str = Field(default="", max_length=3000)
    recording_id: int


class WritingAssignmentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    instructions: str = Field(default="", max_length=5000)
    class_id: int
    starts_at: datetime
    due_at: datetime
    min_words: int = Field(default=0, ge=0, le=100000)
    max_words: int | None = Field(default=None, gt=0, le=100000)
    grammar_hint_mode: WritingGrammarHintMode = WritingGrammarHintMode.OFF
    revision_limit: int = Field(default=1, ge=0, le=20)
    allow_late_submission: bool = False

    @model_validator(mode="after")
    def validate_dates(self):
        if self.starts_at.tzinfo is None or self.due_at.tzinfo is None:
            raise ValueError("开始时间和截止时间必须包含时区")
        if self.due_at <= self.starts_at:
            raise ValueError("截止时间必须晚于开始时间")
        if self.max_words is not None and self.max_words < self.min_words:
            raise ValueError("最多字数必须大于等于最少字数")
        self.starts_at = self.starts_at.astimezone(timezone.utc)
        self.due_at = self.due_at.astimezone(timezone.utc)
        return self


class WritingAssignmentOut(APIModel):
    id: int
    title: str
    instructions: str
    class_id: int
    class_name: str
    teacher_id: int
    teacher_name: str
    status: WritingAssignmentStatus
    starts_at: datetime
    due_at: datetime
    min_words: int
    max_words: int | None
    grammar_hint_mode: WritingGrammarHintMode
    revision_limit: int
    allow_late_submission: bool
    participant_count: int = 0
    submitted_count: int = 0
    finalized_count: int = 0
    my_submission_id: int | None = None
    my_submission_status: WritingSubmissionStatus | None = None


class WritingDraftUpdate(BaseModel):
    content: str = Field(max_length=100000)


class WritingSubmitRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100000)
    client_submit_id: str = Field(min_length=8, max_length=64)


class WritingPresenceEnterRequest(BaseModel):
    client_visit_id: str = Field(min_length=8, max_length=64)


class WritingPresenceHeartbeatRequest(BaseModel):
    client_visit_id: str = Field(min_length=8, max_length=64)


class WritingPresenceLeaveRequest(BaseModel):
    client_visit_id: str = Field(min_length=8, max_length=64)
    reason: str = Field(default="leave", max_length=32)


class WritingIntegrityRequest(BaseModel):
    event_type: str = Field(max_length=32)
    source: str = Field(max_length=32)
    detail: str | None = Field(default=None, max_length=255)


class WritingGrammarIssueOut(APIModel):
    id: int
    start_offset: int
    end_offset: int
    segment_id: str | None
    category: str
    message: str


class WritingRevisionOut(APIModel):
    id: int
    revision_number: int
    content: str
    word_count: int
    grammar_status: WritingGrammarStatus
    grammar_issue_count: int
    submitted_at: datetime
    issues: list[WritingGrammarIssueOut]


class WritingSubmissionOut(APIModel):
    id: int
    assignment_id: int
    student_id: int
    status: WritingSubmissionStatus
    draft_content: str
    draft_word_count: int
    draft_updated_at: datetime
    first_submitted_at: datetime | None
    final_submitted_at: datetime | None
    revisions: list[WritingRevisionOut]
    remaining_revisions: int
    server_time: datetime


class WritingPresenceVisitOut(APIModel):
    id: int
    client_visit_id: str
    started_at: datetime
    ended_at: datetime | None
    last_heartbeat_at: datetime
    end_reason: str | None


class WritingIntegrityEventOut(APIModel):
    id: int
    event_type: str
    source: str
    detail: str | None
    occurred_at: datetime


class WritingTeacherSubmissionSummary(APIModel):
    submission_id: int
    student_id: int
    student_no: str
    student_name: str
    status: WritingSubmissionStatus
    draft_word_count: int
    latest_revision_number: int | None
    latest_grammar_issue_count: int
    first_submitted_at: datetime | None
    final_submitted_at: datetime | None
    total_stay_seconds: float
    total_leave_seconds: float
    leave_count: int
    violation_count: int


class WritingTeacherSubmissionDetail(APIModel):
    submission_id: int
    assignment_id: int
    assignment_title: str
    grammar_hint_mode: WritingGrammarHintMode
    revision_limit: int
    student_id: int
    student_no: str
    student_name: str
    status: WritingSubmissionStatus
    draft_content: str
    draft_word_count: int
    first_submitted_at: datetime | None
    final_submitted_at: datetime | None
    revisions: list[WritingRevisionOut]
    visits: list[WritingPresenceVisitOut]
    integrity_events: list[WritingIntegrityEventOut]
    total_stay_seconds: float
    total_leave_seconds: float
    leave_count: int


class DashboardOut(BaseModel):
    metrics: dict[str, int | float]
    pending_tasks: list[TaskOut] = []
    recent_sessions: list[SessionOut] = []
