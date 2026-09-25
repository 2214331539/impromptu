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
    WritingAssignment,
    WritingIntegrityEvent,
    WritingPresenceVisit,
    WritingRevision,
    WritingSubmission,
)


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def by_student_no(self, student_no: str) -> User | None:
        return self.db.scalar(select(User).where(User.student_no == student_no))

    def by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email.lower()))

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


class WritingRepository:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def assignment_options():
        return (
            joinedload(WritingAssignment.classroom),
            joinedload(WritingAssignment.teacher),
            selectinload(WritingAssignment.submissions).selectinload(WritingSubmission.student),
        )

    def assignment(self, assignment_id: int) -> WritingAssignment | None:
        return self.db.scalar(
            select(WritingAssignment)
            .options(*self.assignment_options())
            .where(WritingAssignment.id == assignment_id)
        )

    def assignments_for_teacher(self, teacher_id: int) -> list[WritingAssignment]:
        return list(
            self.db.scalars(
                select(WritingAssignment)
                .options(*self.assignment_options())
                .where(WritingAssignment.teacher_id == teacher_id)
                .order_by(WritingAssignment.due_at.desc())
            ).unique()
        )

    def assignments_for_student(self, student_id: int) -> list[WritingAssignment]:
        return list(
            self.db.scalars(
                select(WritingAssignment)
                .join(ClassMember, ClassMember.class_id == WritingAssignment.class_id)
                .options(*self.assignment_options())
                .where(ClassMember.student_id == student_id)
                .order_by(WritingAssignment.due_at.desc())
            ).unique()
        )

    @staticmethod
    def submission_options():
        return (
            joinedload(WritingSubmission.assignment).joinedload(WritingAssignment.classroom),
            joinedload(WritingSubmission.assignment).joinedload(WritingAssignment.teacher),
            joinedload(WritingSubmission.student),
            selectinload(WritingSubmission.revisions).selectinload(WritingRevision.issues),
            selectinload(WritingSubmission.visits),
            selectinload(WritingSubmission.integrity_events),
        )

    def submission(self, submission_id: int, for_update: bool = False) -> WritingSubmission | None:
        statement = (
            select(WritingSubmission)
            .options(*self.submission_options())
            .where(WritingSubmission.id == submission_id)
        )
        if for_update:
            statement = statement.with_for_update(of=WritingSubmission)
        return self.db.scalar(statement)

    def submission_for_assignment_student(
        self, assignment_id: int, student_id: int
    ) -> WritingSubmission | None:
        return self.db.scalar(
            select(WritingSubmission)
            .options(*self.submission_options())
            .where(
                WritingSubmission.assignment_id == assignment_id,
                WritingSubmission.student_id == student_id,
            )
        )

    def submissions_for_assignment(self, assignment_id: int) -> list[WritingSubmission]:
        return list(
            self.db.scalars(
                select(WritingSubmission)
                .options(*self.submission_options())
                .where(WritingSubmission.assignment_id == assignment_id)
                .order_by(WritingSubmission.updated_at.desc())
            ).unique()
        )

    def revision_by_client_submit(
        self, submission_id: int, client_submit_id: str
    ) -> WritingRevision | None:
        return self.db.scalar(
            select(WritingRevision)
            .options(selectinload(WritingRevision.issues))
            .where(
                WritingRevision.submission_id == submission_id,
                WritingRevision.client_submit_id == client_submit_id,
            )
        )

    def open_visit(
        self, submission_id: int, client_visit_id: str
    ) -> WritingPresenceVisit | None:
        return self.db.scalar(
            select(WritingPresenceVisit).where(
                WritingPresenceVisit.submission_id == submission_id,
                WritingPresenceVisit.client_visit_id == client_visit_id,
                WritingPresenceVisit.ended_at.is_(None),
            )
        )

    def open_visits(self, submission_id: int) -> list[WritingPresenceVisit]:
        return list(
            self.db.scalars(
                select(WritingPresenceVisit).where(
                    WritingPresenceVisit.submission_id == submission_id,
                    WritingPresenceVisit.ended_at.is_(None),
                )
            )
        )

    def visits_for_submission(self, submission_id: int) -> list[WritingPresenceVisit]:
        return list(
            self.db.scalars(
                select(WritingPresenceVisit)
                .where(WritingPresenceVisit.submission_id == submission_id)
                .order_by(WritingPresenceVisit.started_at)
            )
        )

    def integrity_events_for_submission(self, submission_id: int) -> list[WritingIntegrityEvent]:
        return list(
            self.db.scalars(
                select(WritingIntegrityEvent)
                .where(WritingIntegrityEvent.submission_id == submission_id)
                .order_by(WritingIntegrityEvent.occurred_at.desc())
            )
        )
