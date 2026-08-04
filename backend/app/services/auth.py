from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.entities import User
from app.repositories.repositories import UserRepository
from app.schemas.models import LoginRequest, RegisterRequest, TokenResponse, UserOut


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def register(self, data: RegisterRequest) -> TokenResponse:
        student_no = data.student_no.strip().upper()
        if self.users.by_student_no(student_no):
            raise AppError("ACCOUNT_EXISTS", "该学号或工号已注册", 409)
        user = self.users.add(
            User(
                student_no=student_no,
                name=data.name.strip(),
                password_hash=hash_password(data.password),
                role=data.role,
            )
        )
        self.db.commit()
        return self._token(user)

    def login(self, data: LoginRequest) -> TokenResponse:
        user = self.users.by_student_no(data.student_no.strip().upper())
        if not user or not verify_password(data.password, user.password_hash):
            raise AppError("INVALID_CREDENTIALS", "账号或密码错误", 401)
        if not user.is_active:
            raise AppError("USER_DISABLED", "账号已停用", 403)
        return self._token(user)

    @staticmethod
    def _token(user: User) -> TokenResponse:
        return TokenResponse(
            access_token=create_access_token(user.id, user.role.value),
            user=UserOut.model_validate(user),
        )

