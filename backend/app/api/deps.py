from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.entities import User, UserRole
from app.repositories.repositories import UserRepository

bearer = HTTPBearer(auto_error=False)
DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if not credentials:
        raise AppError("NOT_AUTHENTICATED", "请先登录", 401)
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise AppError("INVALID_TOKEN", "登录状态已失效", 401)
    user = UserRepository(db).get(user_id)
    if not user or not user.is_active:
        raise AppError("USER_DISABLED", "账号不可用", 401)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_teacher(user: CurrentUser) -> User:
    if user.role != UserRole.TEACHER:
        raise AppError("FORBIDDEN", "仅教师可执行此操作", 403)
    return user


def require_student(user: CurrentUser) -> User:
    if user.role != UserRole.STUDENT:
        raise AppError("FORBIDDEN", "仅学生可执行此操作", 403)
    return user


def require_admin(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN:
        raise AppError("FORBIDDEN", "仅系统管理员可执行此操作", 403)
    return user


Teacher = Annotated[User, Depends(require_teacher)]
Student = Annotated[User, Depends(require_student)]
Admin = Annotated[User, Depends(require_admin)]
