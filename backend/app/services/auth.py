import re

from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.entities import User, UserRole
from app.repositories.repositories import UserRepository
from app.schemas.models import LoginRequest, RegisterRequest, TokenResponse, UserOut


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def register(self, data: RegisterRequest) -> TokenResponse:
        student_no = data.student_no.strip().upper()
        if self.users.by_student_no(student_no):
            raise AppError("ACCOUNT_EXISTS", "该学号已注册", 409)
        user = self.users.add(
            User(
                student_no=student_no,
                name=data.name.strip(),
                password_hash=hash_password(data.password),
                role=UserRole.STUDENT,
            )
        )
        self.db.commit()
        return self._token(user)

    def login(self, data: LoginRequest) -> TokenResponse:
        user = self._authenticate(data)
        return self._token(user)

    def admin_login(self, data: LoginRequest) -> TokenResponse:
        user = self._authenticate(data)
        if user.role != UserRole.ADMIN:
            raise AppError("ADMIN_REQUIRED", "该账号不是系统管理员", 403)
        return self._token(user)

    def _authenticate(self, data: LoginRequest) -> User:
        user = self.users.by_student_no(data.student_no.strip().upper())
        if not user or not verify_password(data.password, user.password_hash):
            raise AppError("INVALID_CREDENTIALS", "账号或密码错误", 401)
        if user.role == UserRole.STUDENT and not re.fullmatch(r"\d{6}", user.student_no):
            raise AppError("INVALID_STUDENT_ID", "学生账号必须使用 6 位数字学号", 422)
        if not user.is_active:
            raise AppError("USER_DISABLED", "账号已停用", 403)
        return user

    @staticmethod
    def _token(user: User) -> TokenResponse:
        return TokenResponse(
            access_token=create_access_token(user.id, user.role.value),
            user=UserOut.model_validate(user),
        )
