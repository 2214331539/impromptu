import secrets
import string

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.exceptions import AppError
from app.core.security import hash_password
from app.models.entities import ClassMember, ClassRoom, TrainingTask, User, UserRole
from app.repositories.repositories import UserRepository
from app.schemas.models import (
    AdminClassCreate,
    AdminClassOut,
    AdminClassUpdate,
    AdminOverviewOut,
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
        if self.users.by_student_no(account):
            raise AppError("ACCOUNT_EXISTS", "该账号已存在", 409)
        user = User(
            student_no=account,
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
        if values.get("password"):
            user.password_hash = hash_password(values["password"])
        if "is_active" in values:
            user.is_active = values["is_active"]
        self.db.commit()
        self.db.refresh(user)
        return AdminUserOut.model_validate(user)

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
