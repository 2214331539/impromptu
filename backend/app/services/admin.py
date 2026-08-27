import secrets
import string
from pathlib import Path

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.exceptions import AppError
from app.core.config import settings
from app.core.security import hash_password
from app.models.entities import (
    ClassMember,
    ClassRoom,
    Evaluation,
    Recording,
    Topic,
    TopicBank,
    TopicDrawRecord,
    TrainingNote,
    TrainingSession,
    TrainingTask,
    User,
    UserRole,
)
from app.repositories.repositories import UserRepository
from app.schemas.models import (
    AdminClassCreate,
    AdminClassOut,
    AdminClassUpdate,
    AdminOverviewOut,
    AdminPasswordReset,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
)


class AdminService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def overview(self) -> AdminOverviewOut:
        metrics = {
            "users": self._count(User.id),
            "students": self._count(User.id, User.role == UserRole.STUDENT),
            "teachers": self._count(User.id, User.role == UserRole.TEACHER),
            "classes": self._count(ClassRoom.id),
        }
        recent = list(self.db.scalars(select(User).order_by(User.created_at.desc()).limit(6)))
        return AdminOverviewOut(
            metrics=metrics,
            recent_users=[AdminUserOut.model_validate(item) for item in recent],
        )

    def list_users(self, role: UserRole | None = None) -> list[AdminUserOut]:
        statement = select(User)
        if role is not None:
            statement = statement.where(User.role == role)
        users = self.db.scalars(statement.order_by(User.created_at.desc()))
        return [AdminUserOut.model_validate(item) for item in users]

    def create_user(self, data: AdminUserCreate) -> AdminUserOut:
        account = data.student_no.strip().upper()
        email = data.email.strip().lower()
        if self.users.by_student_no(account):
            raise AppError("ACCOUNT_EXISTS", "该账号已存在", 409)
        if self.users.by_email(email):
            raise AppError("EMAIL_EXISTS", "该邮箱已绑定其他账号", 409)
        user = User(
            student_no=account,
            email=email,
            email_verified=True,
            name=data.name.strip(),
            password_hash=hash_password(data.password),
            role=data.role,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return AdminUserOut.model_validate(user)

    def update_user(self, admin: User, user_id: int, data: AdminUserUpdate) -> AdminUserOut:
        user = self.users.get(user_id)
        if not user:
            raise AppError("USER_NOT_FOUND", "账号不存在", 404)
        values = data.model_dump(exclude_unset=True)
        if user.id == admin.id and values.get("is_active") is False:
            raise AppError("CANNOT_DISABLE_SELF", "不能停用当前管理员账号", 409)
        if "name" in values:
            user.name = values["name"].strip()
        if "email" in values and values["email"] is not None:
            email = values["email"].strip().lower()
            existing = self.users.by_email(email)
            if existing and existing.id != user.id:
                raise AppError("EMAIL_EXISTS", "该邮箱已绑定其他账号", 409)
            user.email = email
            user.email_verified = True
        if values.get("password"):
            user.password_hash = hash_password(values["password"])
        if "is_active" in values:
            user.is_active = values["is_active"]
        self.db.commit()
        self.db.refresh(user)
        return AdminUserOut.model_validate(user)

    def reset_user_password(self, admin: User, user_id: int, data: AdminPasswordReset) -> AdminUserOut:
        user = self.users.get(user_id)
        if not user:
            raise AppError("USER_NOT_FOUND", "Account not found", 404)
        if user.id == admin.id:
            raise AppError("CANNOT_RESET_SELF", "Use change password for the current admin account", 409)
        if user.role not in {UserRole.STUDENT, UserRole.TEACHER}:
            raise AppError("UNSUPPORTED_ACCOUNT_ROLE", "Only student and teacher passwords can be reset here", 409)
        user.password_hash = hash_password(data.password)
        self.db.commit()
        self.db.refresh(user)
        return AdminUserOut.model_validate(user)

    def delete_user(self, admin: User, user_id: int) -> None:
        user = self.users.get(user_id)
        if not user:
            raise AppError("USER_NOT_FOUND", "账号不存在", 404)
        if user.id == admin.id:
            raise AppError("CANNOT_DELETE_SELF", "不能删除当前登录的管理员账号", 409)

        class_ids: list[int] = []
        bank_ids: list[int] = []
        task_ids: list[int] = []
        session_ids: list[int] = []

        if user.role == UserRole.TEACHER:
            class_ids = list(self.db.scalars(select(ClassRoom.id).where(ClassRoom.teacher_id == user.id)))
            bank_ids = list(self.db.scalars(select(TopicBank.id).where(TopicBank.teacher_id == user.id)))
            task_conditions = [TrainingTask.teacher_id == user.id]
            if class_ids:
                task_conditions.append(TrainingTask.class_id.in_(class_ids))
            if bank_ids:
                task_conditions.append(TrainingTask.topic_bank_id.in_(bank_ids))
            task_ids = list(self.db.scalars(select(TrainingTask.id).where(or_(*task_conditions))))

        if user.role == UserRole.STUDENT:
            session_ids.extend(
                self.db.scalars(select(TrainingSession.id).where(TrainingSession.student_id == user.id))
            )

        if task_ids:
            session_ids.extend(
                self.db.scalars(select(TrainingSession.id).where(TrainingSession.task_id.in_(task_ids)))
            )
        session_ids = list(dict.fromkeys(session_ids))

        self._delete_recording_files(session_ids)
        self._delete_session_tree(session_ids)

        if user.role == UserRole.STUDENT:
            self.db.execute(delete(ClassMember).where(ClassMember.student_id == user.id))

        if user.role == UserRole.TEACHER:
            self.db.execute(delete(Evaluation).where(Evaluation.teacher_id == user.id))
            if task_ids:
                self.db.execute(delete(TrainingTask).where(TrainingTask.id.in_(task_ids)))
            if class_ids:
                self.db.execute(delete(ClassMember).where(ClassMember.class_id.in_(class_ids)))
                self.db.execute(delete(ClassRoom).where(ClassRoom.id.in_(class_ids)))
            if bank_ids:
                self.db.execute(delete(Topic).where(Topic.bank_id.in_(bank_ids)))
                self.db.execute(delete(TopicBank).where(TopicBank.id.in_(bank_ids)))

        self.db.delete(user)
        self.db.commit()

    def list_classes(self) -> list[AdminClassOut]:
        classes = self.db.scalars(
            select(ClassRoom)
            .options(
                joinedload(ClassRoom.teacher),
                selectinload(ClassRoom.members),
                selectinload(ClassRoom.tasks),
            )
            .order_by(ClassRoom.created_at.desc())
        ).unique()
        return [self._class_out(item) for item in classes]

    def create_class(self, data: AdminClassCreate) -> AdminClassOut:
        teacher = self._teacher(data.teacher_id)
        classroom = ClassRoom(
            name=data.name.strip(),
            teacher_id=teacher.id,
            invite_code=self._invite_code(),
        )
        self.db.add(classroom)
        self.db.commit()
        return self._class_out(self._class(classroom.id))

    def update_class(self, class_id: int, data: AdminClassUpdate) -> AdminClassOut:
        classroom = self._class(class_id)
        values = data.model_dump(exclude_unset=True)
        if "name" in values:
            classroom.name = values["name"].strip()
        if "teacher_id" in values:
            classroom.teacher_id = self._teacher(values["teacher_id"]).id
        if "is_active" in values:
            classroom.is_active = values["is_active"]
        self.db.commit()
        self.db.expire(classroom)
        return self._class_out(self._class(class_id))

    def _teacher(self, user_id: int) -> User:
        user = self.users.get(user_id)
        if not user or user.role != UserRole.TEACHER or not user.is_active:
            raise AppError("TEACHER_NOT_FOUND", "请选择有效的教师账号", 404)
        return user

    def _class(self, class_id: int) -> ClassRoom:
        classroom = self.db.scalar(
            select(ClassRoom)
            .options(
                joinedload(ClassRoom.teacher),
                selectinload(ClassRoom.members),
                selectinload(ClassRoom.tasks),
            )
            .where(ClassRoom.id == class_id)
        )
        if not classroom:
            raise AppError("CLASS_NOT_FOUND", "班级不存在", 404)
        return classroom

    def _invite_code(self) -> str:
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(20):
            code = "".join(secrets.choice(alphabet) for _ in range(6))
            exists = self.db.scalar(select(ClassRoom.id).where(ClassRoom.invite_code == code))
            if not exists:
                return code
        raise AppError("INVITE_CODE_FAILED", "暂时无法创建班级邀请码", 503)

    def _class_out(self, classroom: ClassRoom) -> AdminClassOut:
        return AdminClassOut(
            id=classroom.id,
            name=classroom.name,
            invite_code=classroom.invite_code,
            is_active=classroom.is_active,
            teacher_id=classroom.teacher_id,
            teacher_name=classroom.teacher.name,
            student_count=len(classroom.members),
            task_count=len(classroom.tasks),
            created_at=classroom.created_at,
        )

    def _count(self, column, *conditions) -> int:
        return self.db.scalar(select(func.count(column)).where(*conditions)) or 0

    def _delete_session_tree(self, session_ids: list[int]) -> None:
        if not session_ids:
            return
        self.db.execute(delete(Evaluation).where(Evaluation.session_id.in_(session_ids)))
        self.db.execute(delete(Recording).where(Recording.session_id.in_(session_ids)))
        self.db.execute(delete(TrainingNote).where(TrainingNote.session_id.in_(session_ids)))
        self.db.execute(delete(TopicDrawRecord).where(TopicDrawRecord.session_id.in_(session_ids)))
        self.db.execute(delete(TrainingSession).where(TrainingSession.id.in_(session_ids)))

    def _delete_recording_files(self, session_ids: list[int]) -> None:
        if not session_ids:
            return
        recordings = list(self.db.scalars(select(Recording).where(Recording.session_id.in_(session_ids))))
        for recording in recordings:
            if recording.storage_provider == "oss":
                self._delete_oss_object(recording.file_path)
            else:
                path = Path(recording.file_path)
                if not path.is_absolute():
                    path = Path(settings.upload_dir) / path.name
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass

    def _delete_oss_object(self, object_key: str) -> None:
        if settings.storage_backend != "oss":
            return
        try:
            from app.storage import OSSStorage

            OSSStorage.from_settings(settings).delete(object_key)
        except Exception:
            pass
