from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.entities import User, UserRole
from app.repositories.repositories import UserRepository
from app.schemas.models import (
    BindEmailRequest,
    ChangePasswordRequest,
    EmailCodeRequest,
    LoginRequest,
    PasswordResetCodeRequest,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services.email import EmailCodeService


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def send_register_code(self, data: EmailCodeRequest) -> None:
        email = data.email.strip().lower()
        account = data.student_no.strip().upper() if data.student_no else None
        if self.users.by_email(email):
            raise AppError("EMAIL_EXISTS", "该邮箱已绑定其他账号", 409)
        if account and self.users.by_student_no(account):
            raise AppError("ACCOUNT_EXISTS", "该账号已注册", 409)
        EmailCodeService(self.db).send(email=email, purpose="register", account=account)

    def register(self, data: RegisterRequest) -> TokenResponse:
        account = data.student_no.strip().upper()
        email = data.email.strip().lower()
        if self.users.by_student_no(account):
            raise AppError("ACCOUNT_EXISTS", "该账号已注册", 409)
        if self.users.by_email(email):
            raise AppError("EMAIL_EXISTS", "该邮箱已绑定其他账号", 409)
        EmailCodeService(self.db).verify(
            email=email,
            purpose="register",
            code=data.email_code,
            account=account,
        )
        user = self.users.add(
            User(
                student_no=account,
                email=email,
                email_verified=True,
                name=data.name.strip(),
                password_hash=hash_password(data.password),
                role=UserRole.STUDENT,
            )
        )
        self.db.commit()
        return self._token(user)

    def login(self, data: LoginRequest) -> TokenResponse:
        return self._token(self._authenticate(data))

    def admin_login(self, data: LoginRequest) -> TokenResponse:
        user = self._authenticate(data, require_email=False)
        if user.role != UserRole.ADMIN:
            raise AppError("ADMIN_REQUIRED", "该账号不是系统管理员", 403)
        return self._token(user)

    def change_password(self, user: User, data: ChangePasswordRequest) -> None:
        if not verify_password(data.current_password, user.password_hash):
            raise AppError("INVALID_CURRENT_PASSWORD", "当前密码不正确", 400)
        if data.current_password == data.new_password:
            raise AppError("PASSWORD_UNCHANGED", "新密码必须与当前密码不同", 400)
        user.password_hash = hash_password(data.new_password)
        self.db.commit()

    def send_bind_email_code(self, user: User, data: EmailCodeRequest) -> None:
        email = data.email.strip().lower()
        owner = self.users.by_email(email)
        if owner and owner.id != user.id:
            raise AppError("EMAIL_EXISTS", "该邮箱已绑定其他账号", 409)
        EmailCodeService(self.db).send(email=email, purpose="bind_email", account=user.student_no)

    def bind_email(self, user: User, data: BindEmailRequest) -> User:
        email = data.email.strip().lower()
        owner = self.users.by_email(email)
        if owner and owner.id != user.id:
            raise AppError("EMAIL_EXISTS", "该邮箱已绑定其他账号", 409)
        EmailCodeService(self.db).verify(
            email=email,
            purpose="bind_email",
            code=data.email_code,
            account=user.student_no,
        )
        user.email = email
        user.email_verified = True
        self.db.commit()
        self.db.refresh(user)
        return user

    def send_password_reset_code(self, data: PasswordResetCodeRequest) -> None:
        account = data.student_no.strip().upper()
        email = data.email.strip().lower()
        user = self.users.by_student_no(account)
        if not user or user.email != email:
            raise AppError("ACCOUNT_EMAIL_MISMATCH", "账号和邮箱不匹配", 404)
        if not user.is_active:
            raise AppError("USER_DISABLED", "账号已停用", 403)
        EmailCodeService(self.db).send(email=email, purpose="password_reset", account=account)

    def reset_password(self, data: PasswordResetRequest) -> None:
        account = data.student_no.strip().upper()
        email = data.email.strip().lower()
        user = self.users.by_student_no(account)
        if not user or user.email != email:
            raise AppError("ACCOUNT_EMAIL_MISMATCH", "账号和邮箱不匹配", 404)
        if not user.is_active:
            raise AppError("USER_DISABLED", "账号已停用", 403)
        EmailCodeService(self.db).verify(
            email=email,
            purpose="password_reset",
            code=data.email_code,
            account=account,
        )
        user.password_hash = hash_password(data.new_password)
        user.email_verified = True
        self.db.commit()

    def _authenticate(self, data: LoginRequest, require_email: bool = True) -> User:
        user = self.users.by_student_no(data.student_no.strip().upper())
        if not user or not verify_password(data.password, user.password_hash):
            raise AppError("INVALID_CREDENTIALS", "账号或密码错误", 401)
        if not user.is_active:
            raise AppError("USER_DISABLED", "账号已停用", 403)
        if (
            require_email
            and settings.require_verified_email
            and user.role in {UserRole.STUDENT, UserRole.TEACHER}
            and user.email
            and not user.email_verified
        ):
            raise AppError("EMAIL_NOT_VERIFIED", "请先完成邮箱验证", 403)
        return user

    @staticmethod
    def _token(user: User) -> TokenResponse:
        return TokenResponse(
            access_token=create_access_token(user.id, user.role.value),
            user=UserOut.model_validate(user),
        )
