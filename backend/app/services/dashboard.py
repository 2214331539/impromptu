from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import ClassMember, ClassRoom, Evaluation, SessionPhase, TaskStatus, TrainingSession, TrainingTask, User
from app.repositories.repositories import SessionRepository, TaskRepository
from app.schemas.models import DashboardOut
from app.services.tasks import task_out
from app.services.training import TrainingService


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def for_student(self, student: User) -> DashboardOut:
        tasks = TaskRepository(self.db).for_student(student.id)
        sessions = SessionRepository(self.db).for_student(student.id)
        submitted = [x for x in sessions if x.phase == SessionPhase.SUBMITTED]
        scores = [x.evaluation.total_score for x in submitted if x.evaluation]
        pending = [x for x in tasks if x.status == TaskStatus.PUBLISHED and not any(s.student_id == student.id and s.phase == SessionPhase.SUBMITTED for s in x.sessions)]
        training = TrainingService(self.db)
        return DashboardOut(
            metrics={
                "completed": len(submitted),
                "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
                "pending": len(pending),
            },
            pending_tasks=[task_out(x, student.id) for x in pending[:4]],
            recent_sessions=[training._out(x) for x in sessions[:4]],
        )

    def for_teacher(self, teacher: User) -> DashboardOut:
        tasks = TaskRepository(self.db).for_teacher(teacher.id)
        class_count = self.db.scalar(
            select(func.count(ClassRoom.id)).where(ClassRoom.teacher_id == teacher.id)
        ) or 0
        student_count = self.db.scalar(
            select(func.count(func.distinct(ClassMember.student_id)))
            .join(ClassRoom)
            .where(ClassRoom.teacher_id == teacher.id)
        ) or 0
        sessions = list(
            self.db.scalars(
                select(TrainingSession)
                .join(TrainingTask)
                .where(TrainingTask.teacher_id == teacher.id)
                .order_by(TrainingSession.updated_at.desc())
            )
        )
        pending_evaluation = sum(x.phase == SessionPhase.SUBMITTED and not x.evaluation for x in sessions)
        published = [x for x in tasks if x.status.value == "published"]
        members_total = sum(len(x.classroom.members) for x in published)
        completed = sum(sum(s.phase == SessionPhase.SUBMITTED for s in x.sessions) for x in published)
        hydrated = SessionRepository(self.db)
        recent = [hydrated.get(x.id) for x in sessions[:5]]
        return DashboardOut(
            metrics={
                "classes": class_count,
                "students": student_count,
                "active_tasks": len(published),
                "pending_evaluation": pending_evaluation,
                "completion_rate": round(completed / members_total * 100, 1) if members_total else 0,
            },
            recent_sessions=[TrainingService(self.db)._out(x) for x in recent if x],
        )
