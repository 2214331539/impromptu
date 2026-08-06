from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.entities import Difficulty, SessionPhase, TaskStatus, UserRole


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(APIModel):
    id: int
    student_no: str
    name: str
    role: UserRole


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_no: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=72)


class LoginRequest(BaseModel):
    student_no: str = Field(min_length=3, max_length=32)
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=6, max_length=72)
    new_password: str = Field(min_length=6, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class AdminUserCreate(BaseModel):
    student_no: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=6, max_length=72)
    role: UserRole

    @model_validator(mode="after")
    def validate_student_number(self):
        if self.role == UserRole.STUDENT and not (
            len(self.student_no) == 6 and self.student_no.isdigit()
        ):
            raise ValueError("学生学号必须为 6 位数字")
        return self


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
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
    prompt: str = Field(min_length=5, max_length=2000)
    category: str = Field(min_length=1, max_length=64)
    difficulty: Difficulty = Difficulty.MEDIUM
    tags: str = Field(default="", max_length=255)


class TopicUpdate(BaseModel):
    prompt: str | None = Field(default=None, min_length=5, max_length=2000)
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


class DashboardOut(BaseModel):
    metrics: dict[str, int | float]
    pending_tasks: list[TaskOut] = []
    recent_sessions: list[SessionOut] = []
