from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.entities import SessionPhase, TaskStatus, TrainingTask, User
from app.repositories.repositories import ClassRepository, TaskRepository, TopicRepository
from app.schemas.models import TaskCreate, TaskOut


def task_out(task: TrainingTask, current_user_id: int | None = None) -> TaskOut:
    participant_count = len(task.classroom.members) if task.classroom.members else 0
    completed_count = sum(s.phase == SessionPhase.SUBMITTED for s in task.sessions)
    my_session = next((s for s in task.sessions if s.student_id == current_user_id), None)
    return TaskOut(
        id=task.id,
        name=task.name,
        description=task.description,
        class_id=task.class_id,
        class_name=task.classroom.name,
        topic_bank_id=task.topic_bank_id,
        topic_bank_name=task.topic_bank.name,
        teacher_id=task.teacher_id,
        teacher_name=task.teacher.name,
        preparation_seconds=task.preparation_seconds,
        speaking_seconds=task.speaking_seconds,
        starts_at=task.starts_at,
        due_at=task.due_at,
        redraw_limit=task.redraw_limit,
        rerecord_limit=task.rerecord_limit,
        notes_required=task.notes_required,
        allow_early_finish=task.allow_early_finish,
        status=task.status,
        participant_count=participant_count,
        completed_count=completed_count,
        completion_rate=round(completed_count / participant_count * 100, 1) if participant_count else 0,
        my_session_id=my_session.id if my_session else None,
        my_phase=my_session.phase if my_session else None,
    )


class TaskService:
    def __init__(self, db: Session):
        self.db = db
        self.tasks = TaskRepository(db)
        self.classes = ClassRepository(db)
        self.topics = TopicRepository(db)

    def list_for(self, user: User) -> list[TaskOut]:
        items = (
            self.tasks.for_teacher(user.id)
            if user.role.value == "teacher"
            else self.tasks.for_student(user.id)
        )
        if user.role.value == "student":
            items = [x for x in items if x.status != TaskStatus.DRAFT]
        return [task_out(item, user.id) for item in items]

    def get_for(self, user: User, task_id: int) -> TaskOut:
        task = self._accessible(user, task_id)
        return task_out(task, user.id)

    def create(self, teacher: User, data: TaskCreate) -> TaskOut:
        classroom = self.classes.get(data.class_id)
        bank = self.topics.bank(data.topic_bank_id)
        if not classroom or classroom.teacher_id != teacher.id:
            raise AppError("CLASS_NOT_FOUND", "目标班级不存在或无权访问", 404)
        if not bank or bank.teacher_id != teacher.id:
            raise AppError("BANK_NOT_FOUND", "题库不存在或无权访问", 404)
        if not any(topic.is_active for topic in bank.topics):
            raise AppError("EMPTY_BANK", "题库中没有启用的题目", 400)
        task = TrainingTask(teacher_id=teacher.id, status=TaskStatus.DRAFT, **data.model_dump())
        self.db.add(task)
        self.db.commit()
        return task_out(self.tasks.get(task.id), teacher.id)

    def set_status(self, teacher: User, task_id: int, status: TaskStatus) -> TaskOut:
        task = self.tasks.get(task_id)
        if not task:
            raise AppError("TASK_NOT_FOUND", "任务不存在", 404)
        if task.teacher_id != teacher.id:
            raise AppError("FORBIDDEN", "无权管理该任务", 403)
        if status == TaskStatus.DRAFT:
            raise AppError("INVALID_STATUS", "不能将任务恢复为草稿", 400)
        task.status = status
        self.db.commit()
        return task_out(self.tasks.get(task.id), teacher.id)

    def _accessible(self, user: User, task_id: int) -> TrainingTask:
        task = self.tasks.get(task_id)
        if not task:
            raise AppError("TASK_NOT_FOUND", "任务不存在", 404)
        if user.role.value == "teacher" and task.teacher_id != user.id:
            raise AppError("FORBIDDEN", "无权访问该任务", 403)
        if user.role.value == "student" and not self.classes.is_member(task.class_id, user.id):
            raise AppError("FORBIDDEN", "你不在该任务班级中", 403)
        if user.role.value == "student" and task.status == TaskStatus.DRAFT:
            raise AppError("TASK_NOT_FOUND", "任务尚未发布", 404)
        return task

