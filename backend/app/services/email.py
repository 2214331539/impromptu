import secrets
import smtplib
from datetime import timezone, timedelta
from email.message import EmailMessage

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.security import hash_password, verify_password
from app.db.base import utc_now
from app.models.entities import EmailCode


class Mailer:
    def send_code(self, email: str, code: str, purpose: str) -> None:
        if not settings.smtp_configured:
            raise AppError("SMTP_NOT_CONFIGURED", "Email service is not configured", 503)

        subject = "Impromptu 邮箱验证码"
        action = "注册验证" if purpose == "register" else "找回密码"
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        message["To"] = email
        message.set_content(
            f"你正在进行 Impromptu {action}。\n\n验证码：{code}\n\n"
            f"验证码 {settings.email_code_expire_minutes} 分钟内有效。"
        )

        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.starttls()
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(message)


class EmailCodeService:
    def __init__(self, db: Session, mailer: Mailer | None = None):
        self.db = db
        self.mailer = mailer or Mailer()

    def send(self, *, email: str, purpose: str, account: str | None = None) -> None:
        normalized_email = self._email(email)
        normalized_account = account.strip().upper() if account else None
        now = utc_now()
        latest = self.db.scalar(
            select(EmailCode)
            .where(
                EmailCode.email == normalized_email,
                EmailCode.purpose == purpose,
            )
            .order_by(EmailCode.created_at.desc())
        )
        if latest:
            latest_created_at = self._aware_utc(latest.created_at)
            next_allowed_at = latest_created_at + timedelta(seconds=settings.email_send_interval_seconds)
            if next_allowed_at > now:
                wait_seconds = max(1, int((next_allowed_at - now).total_seconds()))
                raise AppError(
                    "EMAIL_CODE_TOO_FREQUENT",
                    f"验证码发送过于频繁，请 {wait_seconds} 秒后再试",
                    429,
                )

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        sent_today = self.db.scalar(
            select(func.count(EmailCode.id)).where(
                EmailCode.email == normalized_email,
                EmailCode.purpose == purpose,
                EmailCode.created_at >= today_start,
            )
        ) or 0
        if sent_today >= settings.email_daily_limit:
            raise AppError("EMAIL_CODE_DAILY_LIMIT", "This email has reached today's code limit", 429)

        code = "".join(secrets.choice("0123456789") for _ in range(6))
        item = EmailCode(
            email=normalized_email,
            account=normalized_account,
            purpose=purpose,
            code_hash=hash_password(code),
            expires_at=now + timedelta(minutes=settings.email_code_expire_minutes),
        )
        self.db.add(item)
        self.db.commit()
        try:
            self.mailer.send_code(normalized_email, code, purpose)
        except AppError:
            self.db.delete(item)
            self.db.commit()
            raise
        except smtplib.SMTPAuthenticationError as exc:
            self.db.delete(item)
            self.db.commit()
            raise AppError(
                "EMAIL_AUTH_FAILED",
                "邮箱服务认证失败，请检查 SMTP 用户名和 SMTP 密码",
                502,
            ) from exc
        except smtplib.SMTPException as exc:
            self.db.delete(item)
            self.db.commit()
            raise AppError("EMAIL_SEND_FAILED", "验证码邮件发送失败，请检查邮件服务配置", 502) from exc
        except Exception:
            self.db.delete(item)
            self.db.commit()
            raise AppError("EMAIL_SEND_FAILED", "验证码邮件发送失败，请稍后重试", 502)

    def verify(self, *, email: str, purpose: str, code: str, account: str | None = None) -> EmailCode:
        normalized_email = self._email(email)
        normalized_account = account.strip().upper() if account else None
        statement = (
            select(EmailCode)
            .where(
                EmailCode.email == normalized_email,
                EmailCode.purpose == purpose,
                EmailCode.consumed_at.is_(None),
            )
            .order_by(EmailCode.created_at.desc())
        )
        if normalized_account:
            statement = statement.where(EmailCode.account == normalized_account)
        item = self.db.scalar(statement)
        now = utc_now()
        expires_at = self._aware_utc(item.expires_at) if item else None
        if not item or not expires_at or expires_at < now or not verify_password(code.strip(), item.code_hash):
            raise AppError("INVALID_EMAIL_CODE", "Email code is invalid or expired", 400)
        item.consumed_at = now
        self.db.flush()
        return item

    @staticmethod
    def _email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _aware_utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
