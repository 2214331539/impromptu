from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.entities import (
    ClassMember,
    ClassRoom,
    Topic,
    TopicBank,
    TrainingSession,
    TrainingTask,
    User,
)


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def by_student_no(self, student_no: str) -> User | None:
        return self.db.scalar(select(User).where(User.student_no == student_no))

    def get(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def add(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user


class ClassRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, class_id: int) -> ClassRoom | None:
        return self.db.scalar(
            select(ClassRoom)
            .options(selectinload(ClassRoom.members).selectinload(ClassMember.student))
            .where(ClassRoom.id == class_id)
        )

    def by_invite_code(self, code: str) -> ClassRoom | None:
        return self.db.scalar(select(ClassRoom).where(ClassRoom.invite_code == code))

    def for_teacher(self, teacher_id: int) -> list[ClassRoom]:
        return list(
            self.db.scalars(
                select(ClassRoom)
                .options(selectinload(ClassRoom.members), selectinload(ClassRoom.tasks))
                .where(ClassRoom.teacher_id == teacher_id)
                .order_by(ClassRoom.created_at.desc())
            )
        )

    def for_student(self, student_id: int) -> list[ClassRoom]:
        return list(
            self.db.scalars(
                select(ClassRoom)
                .join(ClassMember)
                .where(ClassMember.student_id == student_id)
                .order_by(ClassRoom.name)
            )
        )

    def is_member(self, class_id: int, student_id: int) -> bool:
        return self.db.scalar(
            select(ClassMember.id).where(
                ClassMember.class_id == class_id, ClassMember.student_id == student_id
            )
        ) is not None


class TopicRepository:
    def __init__(self, db: Session):
        self.db = db

    def bank(self, bank_id: int) -> TopicBank | None:
        return self.db.scalar(
            select(TopicBank).options(selectinload(TopicBank.topics)).where(TopicBank.id == bank_id)
        )

    def banks_for_teacher(self, teacher_id: int) -> list[TopicBank]:
        return list(
            self.db.scalars(
                select(TopicBank)
                .options(selectinload(TopicBank.topics))
                .where(TopicBank.teacher_id == teacher_id)
                .order_by(TopicBank.created_at.desc())
            )
        )

    def topic(self, topic_id: int) -> Topic | None:
        return self.db.get(Topic, topic_id)

    def active_topic_ids(self, bank_id: int) -> list[int]:
        return list(
            self.db.scalars(
                select(Topic.id).where(Topic.bank_id == bank_id, Topic.is_active.is_(True))
            )
        )


class TaskRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def options():
        return (
            joinedload(TrainingTask.classroom),
            joinedload(TrainingTask.topic_bank),
            joinedload(TrainingTask.teacher),
            selectinload(TrainingTask.sessions),
        )

    def get(self, task_id: int) -> TrainingTask | None:
        return self.db.scalar(
            select(TrainingTask).options(*self.options()).where(TrainingTask.id == task_id)
        )

    def for_teacher(self, teacher_id: int) -> list[TrainingTask]:
        return list(
            self.db.scalars(
                select(TrainingTask)
                .options(*self.options())
                .where(TrainingTask.teacher_id == teacher_id)
                .order_by(TrainingTask.due_at.desc())
            ).unique()
        )

    def for_student(self, student_id: int) -> list[TrainingTask]:
        return list(
            self.db.scalars(
                select(TrainingTask)
                .join(ClassMember, ClassMember.class_id == TrainingTask.class_id)
                .options(*self.options())
                .where(ClassMember.student_id == student_id)
                .order_by(TrainingTask.due_at.desc())
            ).unique()
        )


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def options():
        return (
            joinedload(TrainingSession.task).joinedload(TrainingTask.classroom),
            joinedload(TrainingSession.task).joinedload(TrainingTask.topic_bank),
            joinedload(TrainingSession.task).joinedload(TrainingTask.teacher),
            joinedload(TrainingSession.student),
            joinedload(TrainingSession.final_topic),
            selectinload(TrainingSession.draws),
            joinedload(TrainingSession.note),
            selectinload(TrainingSession.recordings),
            joinedload(TrainingSession.evaluation),
        )

    def get(self, session_id: int, for_update: bool = False) -> TrainingSession | None:
        statement = select(TrainingSession).options(*self.options()).where(TrainingSession.id == session_id)
        if for_update:
            statement = statement.with_for_update(of=TrainingSession)
        return self.db.scalar(statement)

    def for_task_student(self, task_id: int, student_id: int) -> TrainingSession | None:
        return self.db.scalar(
            select(TrainingSession)
            .options(*self.options())
            .where(TrainingSession.task_id == task_id, TrainingSession.student_id == student_id)
        )

    def for_student(self, student_id: int) -> list[TrainingSession]:
        return list(
            self.db.scalars(
                select(TrainingSession)
                .options(*self.options())
                .where(TrainingSession.student_id == student_id)
                .order_by(TrainingSession.updated_at.desc())
            ).unique()
        )

    def for_task(self, task_id: int) -> list[TrainingSession]:
        return list(
            self.db.scalars(
                select(TrainingSession)
                .options(*self.options())
                .where(TrainingSession.task_id == task_id)
                .order_by(TrainingSession.updated_at.desc())
            ).unique()
        )
