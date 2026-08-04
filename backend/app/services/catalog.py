import secrets
import string

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.entities import (
    ClassMember,
    ClassRoom,
    Evaluation,
    SessionPhase,
    Topic,
    TopicBank,
    TrainingSession,
    User,
)
from app.repositories.repositories import ClassRepository, TopicRepository
from app.schemas.models import (
    ClassCreate,
    ClassOut,
    MemberOut,
    TopicBankCreate,
    TopicBankOut,
    TopicCreate,
    TopicOut,
    TopicUpdate,
)


class ClassService:
    def __init__(self, db: Session):
        self.db = db
        self.classes = ClassRepository(db)

    def list_for(self, user: User) -> list[ClassOut]:
        items = (
            self.classes.for_teacher(user.id)
            if user.role.value == "teacher"
            else self.classes.for_student(user.id)
        )
        return [
            ClassOut(
                id=item.id,
                name=item.name,
                invite_code=item.invite_code,
                is_active=item.is_active,
                student_count=len(item.members) if item.members else self._member_count(item.id),
                task_count=len(item.tasks) if item.tasks else self._task_count(item.id),
            )
            for item in items
        ]

    def create(self, teacher: User, data: ClassCreate) -> ClassOut:
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(10):
            code = "".join(secrets.choice(alphabet) for _ in range(6))
            if not self.classes.by_invite_code(code):
                break
        classroom = ClassRoom(name=data.name.strip(), teacher_id=teacher.id, invite_code=code)
        self.db.add(classroom)
        self.db.commit()
        self.db.refresh(classroom)
        return ClassOut(
            id=classroom.id,
            name=classroom.name,
            invite_code=classroom.invite_code,
            is_active=True,
        )

    def join(self, student: User, invite_code: str) -> ClassOut:
        classroom = self.classes.by_invite_code(invite_code.strip().upper())
        if not classroom or not classroom.is_active:
            raise AppError("CLASS_NOT_FOUND", "邀请码无效", 404)
        if not self.classes.is_member(classroom.id, student.id):
            self.db.add(ClassMember(class_id=classroom.id, student_id=student.id))
            self.db.commit()
        return ClassOut(
            id=classroom.id,
            name=classroom.name,
            invite_code=classroom.invite_code,
            is_active=classroom.is_active,
            student_count=self._member_count(classroom.id),
            task_count=self._task_count(classroom.id),
        )

    def members(self, teacher: User, class_id: int) -> list[MemberOut]:
        classroom = self._owned(teacher.id, class_id)
        result = []
        for membership in classroom.members:
            scores = list(
                self.db.scalars(
                    select(Evaluation.total_score)
                    .join(TrainingSession)
                    .where(TrainingSession.student_id == membership.student_id)
                )
            )
            completed = self.db.scalar(
                select(func.count(TrainingSession.id)).where(
                    TrainingSession.student_id == membership.student_id,
                    TrainingSession.phase == SessionPhase.SUBMITTED,
                )
            ) or 0
            result.append(
                MemberOut(
                    id=membership.student.id,
                    student_no=membership.student.student_no,
                    name=membership.student.name,
                    completed_count=completed,
                    average_score=round(sum(scores) / len(scores), 1) if scores else None,
                )
            )
        return result

    def remove_member(self, teacher: User, class_id: int, student_id: int) -> None:
        self._owned(teacher.id, class_id)
        deleted = self.db.execute(
            delete(ClassMember).where(
                ClassMember.class_id == class_id, ClassMember.student_id == student_id
            )
        )
        if not deleted.rowcount:
            raise AppError("MEMBER_NOT_FOUND", "学生不在该班级", 404)
        self.db.commit()

    def _owned(self, teacher_id: int, class_id: int) -> ClassRoom:
        classroom = self.classes.get(class_id)
        if not classroom:
            raise AppError("CLASS_NOT_FOUND", "班级不存在", 404)
        if classroom.teacher_id != teacher_id:
            raise AppError("FORBIDDEN", "无权管理该班级", 403)
        return classroom

    def _member_count(self, class_id: int) -> int:
        return self.db.scalar(
            select(func.count(ClassMember.id)).where(ClassMember.class_id == class_id)
        ) or 0

    def _task_count(self, class_id: int) -> int:
        from app.models.entities import TrainingTask

        return self.db.scalar(
            select(func.count(TrainingTask.id)).where(TrainingTask.class_id == class_id)
        ) or 0


class TopicService:
    def __init__(self, db: Session):
        self.db = db
        self.topics = TopicRepository(db)

    def list_banks(self, teacher: User) -> list[TopicBankOut]:
        return [self._bank_out(bank) for bank in self.topics.banks_for_teacher(teacher.id)]

    def create_bank(self, teacher: User, data: TopicBankCreate) -> TopicBankOut:
        bank = TopicBank(
            name=data.name.strip(), description=data.description.strip(), teacher_id=teacher.id
        )
        self.db.add(bank)
        self.db.commit()
        self.db.refresh(bank)
        return self._bank_out(bank)

    def list_topics(
        self,
        teacher: User,
        bank_id: int,
        category: str | None = None,
        difficulty: str | None = None,
        active: bool | None = None,
    ) -> list[TopicOut]:
        self._owned_bank(teacher.id, bank_id)
        statement = select(Topic).where(Topic.bank_id == bank_id)
        if category:
            statement = statement.where(Topic.category == category)
        if difficulty:
            statement = statement.where(Topic.difficulty == difficulty)
        if active is not None:
            statement = statement.where(Topic.is_active == active)
        return [TopicOut.model_validate(x) for x in self.db.scalars(statement.order_by(Topic.created_at.desc()))]

    def create_topic(self, teacher: User, bank_id: int, data: TopicCreate) -> TopicOut:
        self._owned_bank(teacher.id, bank_id)
        topic = Topic(bank_id=bank_id, **data.model_dump())
        self.db.add(topic)
        self.db.commit()
        self.db.refresh(topic)
        return TopicOut.model_validate(topic)

    def update_topic(self, teacher: User, topic_id: int, data: TopicUpdate) -> TopicOut:
        topic = self.topics.topic(topic_id)
        if not topic:
            raise AppError("TOPIC_NOT_FOUND", "题目不存在", 404)
        self._owned_bank(teacher.id, topic.bank_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(topic, key, value)
        self.db.commit()
        self.db.refresh(topic)
        return TopicOut.model_validate(topic)

    def delete_topic(self, teacher: User, topic_id: int) -> None:
        topic = self.topics.topic(topic_id)
        if not topic:
            raise AppError("TOPIC_NOT_FOUND", "题目不存在", 404)
        self._owned_bank(teacher.id, topic.bank_id)
        referenced = self.db.scalar(
            select(func.count(TrainingSession.id)).where(TrainingSession.final_topic_id == topic.id)
        )
        if referenced:
            topic.is_active = False
        else:
            self.db.delete(topic)
        self.db.commit()

    def _owned_bank(self, teacher_id: int, bank_id: int) -> TopicBank:
        bank = self.topics.bank(bank_id)
        if not bank:
            raise AppError("BANK_NOT_FOUND", "题库不存在", 404)
        if bank.teacher_id != teacher_id:
            raise AppError("FORBIDDEN", "无权管理该题库", 403)
        return bank

    @staticmethod
    def _bank_out(bank: TopicBank) -> TopicBankOut:
        topics = bank.topics or []
        return TopicBankOut(
            id=bank.id,
            name=bank.name,
            description=bank.description,
            is_active=bank.is_active,
            topic_count=len(topics),
            active_topic_count=sum(item.is_active for item in topics),
        )

