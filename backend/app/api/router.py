from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import Admin, CurrentUser, DB, Student, Teacher
from app.core.exceptions import AppError
from app.models.entities import TaskStatus, UserRole
from app.schemas.models import (
    AdminClassCreate,
    AdminClassOut,
    AdminClassUpdate,
    AdminOverviewOut,
    AdminPasswordReset,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    ChangePasswordRequest,
    ClassCreate,
    ClassOut,
    DashboardOut,
    DrawOut,
    EvaluationCreate,
    JoinClassRequest,
    LoginRequest,
    MemberOut,
    NoteUpdate,
    RecordingOut,
    RegisterRequest,
    SessionOut,
    SubmitSessionRequest,
    TaskCreate,
    TaskOut,
    TokenResponse,
    TopicBankCreate,
    TopicBankOut,
    TopicCreate,
    TopicImportCommitOut,
    TopicImportCommitRequest,
    TopicImportPreviewOut,
    TopicOut,
    TopicUpdate,
    UserOut,
)
from app.services.admin import AdminService
from app.services.auth import AuthService
from app.services.catalog import ClassService, TopicService
from app.services.dashboard import DashboardService
from app.services.tasks import TaskService
from app.services.topic_import import TopicImportService
from app.services.training import TrainingService

router = APIRouter()


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: DB):
    return AuthService(db).register(data)


@router.post("/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: DB):
    return AuthService(db).login(data)


@router.post("/admin/auth/login", response_model=TokenResponse)
def admin_login(data: LoginRequest, db: DB):
    return AuthService(db).admin_login(data)


@router.get("/auth/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/auth/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: ChangePasswordRequest, user: CurrentUser, db: DB):
    AuthService(db).change_password(user, data)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/overview", response_model=AdminOverviewOut)
def admin_overview(_: Admin, db: DB):
    return AdminService(db).overview()


@router.get("/admin/users", response_model=list[AdminUserOut])
def admin_users(_: Admin, db: DB, role: UserRole | None = Query(default=None)):
    return AdminService(db).list_users(role)


@router.post("/admin/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def admin_create_user(data: AdminUserCreate, _: Admin, db: DB):
    return AdminService(db).create_user(data)


@router.patch("/admin/users/{user_id}", response_model=AdminUserOut)
def admin_update_user(user_id: int, data: AdminUserUpdate, admin: Admin, db: DB):
    return AdminService(db).update_user(admin, user_id, data)


@router.post("/admin/users/{user_id}/reset-password", response_model=AdminUserOut)
def admin_reset_user_password(user_id: int, data: AdminPasswordReset, admin: Admin, db: DB):
    return AdminService(db).reset_user_password(admin, user_id, data)


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(user_id: int, admin: Admin, db: DB):
    AdminService(db).delete_user(admin, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/classes", response_model=list[AdminClassOut])
def admin_classes(_: Admin, db: DB):
    return AdminService(db).list_classes()


@router.post("/admin/classes", response_model=AdminClassOut, status_code=status.HTTP_201_CREATED)
def admin_create_class(data: AdminClassCreate, _: Admin, db: DB):
    return AdminService(db).create_class(data)


@router.patch("/admin/classes/{class_id}", response_model=AdminClassOut)
def admin_update_class(class_id: int, data: AdminClassUpdate, _: Admin, db: DB):
    return AdminService(db).update_class(class_id, data)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: CurrentUser, db: DB):
    service = DashboardService(db)
    if user.role == UserRole.TEACHER:
        return service.for_teacher(user)
    if user.role == UserRole.STUDENT:
        return service.for_student(user)
    raise AppError("FORBIDDEN", "系统管理员请使用管理工作台", 403)


@router.get("/classes", response_model=list[ClassOut])
def list_classes(user: CurrentUser, db: DB):
    return ClassService(db).list_for(user)


@router.post("/classes", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(data: ClassCreate, teacher: Teacher, db: DB):
    return ClassService(db).create(teacher, data)


@router.post("/classes/join", response_model=ClassOut)
def join_class(data: JoinClassRequest, student: Student, db: DB):
    return ClassService(db).join(student, data.invite_code)


@router.get("/classes/{class_id}/members", response_model=list[MemberOut])
def class_members(class_id: int, teacher: Teacher, db: DB):
    return ClassService(db).members(teacher, class_id)


@router.delete("/classes/{class_id}/members/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_class_member(class_id: int, student_id: int, teacher: Teacher, db: DB):
    ClassService(db).remove_member(teacher, class_id, student_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/topic-banks", response_model=list[TopicBankOut])
def list_banks(teacher: Teacher, db: DB):
    return TopicService(db).list_banks(teacher)


@router.post("/topic-banks", response_model=TopicBankOut, status_code=status.HTTP_201_CREATED)
def create_bank(data: TopicBankCreate, teacher: Teacher, db: DB):
    return TopicService(db).create_bank(teacher, data)


@router.delete("/topic-banks/{bank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bank(bank_id: int, teacher: Teacher, db: DB):
    TopicService(db).delete_bank(teacher, bank_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/topic-banks/import-preview", response_model=TopicImportPreviewOut)
async def preview_topic_bank_import(
    teacher: Teacher,
    name: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    raw_text: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
):
    content = await file.read() if file else None
    return TopicImportService().preview(
        name=name,
        description=description,
        raw_text=raw_text,
        filename=file.filename if file else None,
        file_content=content,
    )


@router.post(
    "/topic-banks/import-commit",
    response_model=TopicImportCommitOut,
    status_code=status.HTTP_201_CREATED,
)
def commit_topic_bank_import(data: TopicImportCommitRequest, teacher: Teacher, db: DB):
    return TopicService(db).import_bank(teacher, data)


@router.get("/topic-banks/{bank_id}/topics", response_model=list[TopicOut])
def list_topics(
    bank_id: int,
    teacher: Teacher,
    db: DB,
    category: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    active: bool | None = Query(default=None),
):
    return TopicService(db).list_topics(teacher, bank_id, category, difficulty, active)


@router.post("/topic-banks/{bank_id}/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def create_topic(bank_id: int, data: TopicCreate, teacher: Teacher, db: DB):
    return TopicService(db).create_topic(teacher, bank_id, data)


@router.patch("/topics/{topic_id}", response_model=TopicOut)
def update_topic(topic_id: int, data: TopicUpdate, teacher: Teacher, db: DB):
    return TopicService(db).update_topic(teacher, topic_id, data)


@router.delete("/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(topic_id: int, teacher: Teacher, db: DB):
    TopicService(db).delete_topic(teacher, topic_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(user: CurrentUser, db: DB):
    return TaskService(db).list_for(user)


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, user: CurrentUser, db: DB):
    return TaskService(db).get_for(user, task_id)


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(data: TaskCreate, teacher: Teacher, db: DB):
    return TaskService(db).create(teacher, data)


@router.post("/tasks/{task_id}/publish", response_model=TaskOut)
def publish_task(task_id: int, teacher: Teacher, db: DB):
    return TaskService(db).set_status(teacher, task_id, TaskStatus.PUBLISHED)


@router.post("/tasks/{task_id}/close", response_model=TaskOut)
def close_task(task_id: int, teacher: Teacher, db: DB):
    return TaskService(db).set_status(teacher, task_id, TaskStatus.CLOSED)


@router.get("/tasks/{task_id}/submissions", response_model=list[SessionOut])
def task_submissions(task_id: int, teacher: Teacher, db: DB):
    return TrainingService(db).submissions(teacher, task_id)


@router.post("/tasks/{task_id}/sessions", response_model=SessionOut)
def start_session(task_id: int, student: Student, db: DB):
    return TrainingService(db).create_or_get(student, task_id)


@router.get("/sessions/history", response_model=list[SessionOut])
def session_history(student: Student, db: DB):
    return TrainingService(db).history(student)


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int, user: CurrentUser, db: DB):
    return TrainingService(db).get_for(user, session_id)


@router.post("/sessions/{session_id}/draw", response_model=DrawOut)
def draw_topic(session_id: int, student: Student, db: DB):
    return TrainingService(db).draw(student, session_id)


@router.post("/sessions/{session_id}/complete-mic-check", response_model=SessionOut)
def complete_mic_check(session_id: int, student: Student, db: DB):
    return TrainingService(db).complete_mic_check(student, session_id)


@router.post("/sessions/{session_id}/confirm-topic", response_model=SessionOut)
def confirm_topic(session_id: int, student: Student, db: DB):
    return TrainingService(db).confirm_topic(student, session_id)


@router.patch("/sessions/{session_id}/note", response_model=SessionOut)
def save_note(session_id: int, data: NoteUpdate, student: Student, db: DB):
    return TrainingService(db).save_note(student, session_id, data.content)


@router.post("/sessions/{session_id}/start-speaking", response_model=SessionOut)
def start_speaking(session_id: int, student: Student, db: DB):
    return TrainingService(db).start_speaking(student, session_id)


@router.post("/sessions/{session_id}/start-preparation", response_model=SessionOut)
def start_preparation(session_id: int, student: Student, db: DB):
    return TrainingService(db).start_preparation(student, session_id)


@router.post("/sessions/{session_id}/finish-speaking", response_model=SessionOut)
def finish_speaking(session_id: int, student: Student, db: DB):
    return TrainingService(db).finish_speaking(student, session_id)


@router.post("/sessions/{session_id}/retry-speaking", response_model=SessionOut)
def retry_speaking(session_id: int, student: Student, db: DB):
    return TrainingService(db).retry_speaking(student, session_id)


@router.post("/sessions/{session_id}/recordings", response_model=RecordingOut)
async def upload_recording(
    session_id: int,
    student: Student,
    db: DB,
    file: Annotated[UploadFile, File()],
    duration_seconds: Annotated[float, Form(ge=0, le=7200)] = 0,
):
    return await TrainingService(db).upload_recording(student, session_id, file, duration_seconds)


@router.get("/recordings/{recording_id}/download")
def download_recording(recording_id: int, user: CurrentUser, db: DB):
    media = TrainingService(db).download_recording(user, recording_id)
    return StreamingResponse(
        media.body,
        media_type="audio/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{media.filename}"',
            "Content-Length": str(media.size_bytes),
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/recordings/{recording_id}/stream")
def stream_recording(recording_id: int, user: CurrentUser, db: DB):
    media = TrainingService(db).stream_recording(user, recording_id)
    return StreamingResponse(
        media.body,
        media_type=media.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{media.filename}"',
            "Content-Length": str(media.size_bytes),
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/sessions/{session_id}/submit", response_model=SessionOut)
def submit_session(session_id: int, data: SubmitSessionRequest, student: Student, db: DB):
    return TrainingService(db).submit(student, session_id, data)


@router.put("/sessions/{session_id}/evaluation", response_model=SessionOut)
def evaluate_session(session_id: int, data: EvaluationCreate, teacher: Teacher, db: DB):
    return TrainingService(db).evaluate(teacher, session_id, data)
