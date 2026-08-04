import secrets
import shutil
import subprocess
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError
from app.db.base import utc_now
from app.models.entities import (
    Evaluation,
    Recording,
    SessionPhase,
    TaskStatus,
    TopicDrawRecord,
    TrainingNote,
    TrainingSession,
    User,
)
from app.repositories.repositories import ClassRepository, SessionRepository, TaskRepository, TopicRepository
from app.schemas.models import (
    DrawOut,
    EvaluationCreate,
    EvaluationOut,
    RecordingOut,
    SessionOut,
    SubmitSessionRequest,
    TopicOut,
)
from app.services.tasks import task_out
from app.storage import OSSStorage


@dataclass(frozen=True)
class RecordingMedia:
    body: Iterator[bytes]
    mime_type: str
    size_bytes: int
    filename: str


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class TrainingService:
    allowed_mime_types = {
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".mp4",
        "video/mp4": ".mp4",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
    }

    def __init__(self, db: Session):
        self.db = db
        self.sessions = SessionRepository(db)
        self.tasks = TaskRepository(db)
        self.classes = ClassRepository(db)
        self.topics = TopicRepository(db)

    def create_or_get(self, student: User, task_id: int) -> SessionOut:
        task = self.tasks.get(task_id)
        if not task or task.status != TaskStatus.PUBLISHED:
            raise AppError("TASK_NOT_AVAILABLE", "任务未发布或已关闭", 404)
        if not self.classes.is_member(task.class_id, student.id):
            raise AppError("FORBIDDEN", "你不在该任务班级中", 403)
        now = utc_now()
        if now < aware(task.starts_at):
            raise AppError("TASK_NOT_STARTED", "任务尚未开始", 400)
        if now > aware(task.due_at):
            raise AppError("TASK_EXPIRED", "任务已截止", 400)
        existing = self.sessions.for_task_student(task.id, student.id)
        if existing:
            return self.get_for(student, existing.id)
        session = TrainingSession(task_id=task.id, student_id=student.id)
        self.db.add(session)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            session = self.sessions.for_task_student(task.id, student.id)
        return self.get_for(student, session.id)

    def get_for(self, user: User, session_id: int) -> SessionOut:
        session = self._accessible(user, session_id)
        if self._reconcile(session):
            self.db.commit()
            session = self.sessions.get(session_id)
        return self._out(session)

    def history(self, student: User) -> list[SessionOut]:
        result = []
        for session in self.sessions.for_student(student.id):
            if self._reconcile(session):
                self.db.commit()
            result.append(self._out(session))
        return result

    def submissions(self, teacher: User, task_id: int) -> list[SessionOut]:
        task = self.tasks.get(task_id)
        if not task or task.teacher_id != teacher.id:
            raise AppError("TASK_NOT_FOUND", "任务不存在或无权访问", 404)
        return [self._out(item) for item in self.sessions.for_task(task_id)]

    def draw(self, student: User, session_id: int) -> DrawOut:
        session = self._student_session(student.id, session_id, lock=True)
        if session.phase != SessionPhase.DRAWING or session.final_topic_id:
            raise AppError("TOPIC_LOCKED", "题目已确认，不能继续抽题", 409)
        max_draws = session.task.redraw_limit + 1
        if len(session.draws) >= max_draws:
            raise AppError("REDRAW_LIMIT", "重新抽题次数已用完", 409)
        active_ids = self.topics.active_topic_ids(session.task.topic_bank_id)
        if not active_ids:
            raise AppError("EMPTY_BANK", "该任务暂无可用题目", 409)
        previous = {item.topic_id for item in session.draws}
        candidates = [item for item in active_ids if item not in previous] or active_ids
        record = TopicDrawRecord(
            session_id=session.id,
            topic_id=secrets.choice(candidates),
            draw_number=len(session.draws) + 1,
        )
        self.db.add(record)
        self.db.commit()
        self.db.expire(session, ["draws"])
        return self._draw_out(session.draws[-1], session.task.redraw_limit)

    def complete_mic_check(self, student: User, session_id: int) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        if session.phase == SessionPhase.DRAWING:
            return self._out(session)
        if session.phase != SessionPhase.MIC_CHECK:
            raise AppError("INVALID_PHASE", "当前不在试音阶段", 409)
        session.phase = SessionPhase.DRAWING
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def confirm_topic(self, student: User, session_id: int) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        if session.phase != SessionPhase.DRAWING:
            return self._out(session)
        if not session.draws:
            raise AppError("DRAW_REQUIRED", "请先抽取题目", 400)
        latest = session.draws[-1]
        latest.confirmed = True
        session.final_topic_id = latest.topic_id
        now = utc_now()
        session.phase = SessionPhase.RESEARCHING
        session.research_started_at = now
        session.research_ends_at = now + timedelta(seconds=session.task.research_seconds)
        session.preparation_started_at = None
        session.preparation_ends_at = None
        if not session.note:
            session.note = TrainingNote(content="")
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def start_preparation(self, student: User, session_id: int) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        if self._reconcile(session):
            self.db.commit()
            session = self.sessions.get(session_id)
        if session.phase == SessionPhase.PREPARING:
            return self._out(session)
        if session.phase != SessionPhase.RESEARCHING or not session.final_topic_id:
            raise AppError("INVALID_PHASE", "请先完成选题和资料搜集", 409)
        now = utc_now()
        session.phase = SessionPhase.PREPARING
        session.preparation_started_at = now
        session.preparation_ends_at = now + timedelta(seconds=session.task.preparation_seconds)
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def save_note(self, student: User, session_id: int, content: str) -> SessionOut:
        session = self._student_session(student.id, session_id)
        self._reconcile(session)
        if session.phase == SessionPhase.SUBMITTED or (session.note and session.note.locked):
            raise AppError("NOTE_LOCKED", "训练结束后不能修改笔记", 409)
        if not session.note:
            session.note = TrainingNote(content=content)
        else:
            session.note.content = content
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def start_speaking(self, student: User, session_id: int) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        reconciled = self._reconcile(session)
        if session.phase == SessionPhase.SPEAKING:
            if reconciled:
                self.db.commit()
                session = self.sessions.get(session_id)
            return self._out(session)
        if session.phase != SessionPhase.PREPARING:
            raise AppError("INVALID_PHASE", "当前不能开始演讲", 409)
        now = utc_now()
        if not session.task.allow_early_finish and now < aware(session.preparation_ends_at):
            raise AppError("PREPARATION_ACTIVE", "准备倒计时尚未结束", 409)
        session.phase = SessionPhase.SPEAKING
        session.speaking_started_at = now
        session.speaking_ends_at = now + timedelta(seconds=session.task.speaking_seconds)
        session.recording_attempts_started += 1
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def retry_speaking(self, student: User, session_id: int) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        if session.phase != SessionPhase.REVIEW:
            raise AppError("INVALID_PHASE", "当前不能重新录制", 409)
        if session.recording_attempts_started >= session.task.rerecord_limit + 1:
            raise AppError("RERECORD_LIMIT", "重新录制次数已用完", 409)
        now = utc_now()
        session.phase = SessionPhase.SPEAKING
        session.speaking_started_at = now
        session.speaking_ends_at = now + timedelta(seconds=session.task.speaking_seconds)
        session.speaking_finished_at = None
        session.recording_attempts_started += 1
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def finish_speaking(self, student: User, session_id: int) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        reconciled = self._reconcile(session)
        if session.phase == SessionPhase.REVIEW:
            if reconciled:
                self.db.commit()
                session = self.sessions.get(session_id)
            return self._out(session)
        if session.phase != SessionPhase.SPEAKING:
            raise AppError("INVALID_PHASE", "当前没有进行中的演讲", 409)
        session.phase = SessionPhase.REVIEW
        session.speaking_finished_at = min(utc_now(), aware(session.speaking_ends_at))
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    async def upload_recording(
        self, student: User, session_id: int, file: UploadFile, duration_seconds: float
    ) -> RecordingOut:
        session = self._student_session(student.id, session_id)
        self._reconcile(session)
        if session.phase != SessionPhase.REVIEW:
            raise AppError("INVALID_PHASE", "请先完成演讲", 409)
        mime_type = (file.content_type or "").split(";")[0]
        if mime_type not in self.allowed_mime_types:
            raise AppError("INVALID_AUDIO_TYPE", "仅支持 WebM、OGG、M4A、MP3 或 WAV 音频", 415)
        attempt = session.recording_attempts_started
        if attempt <= 0 or attempt > session.task.rerecord_limit + 1:
            raise AppError("RERECORD_LIMIT", "重新录制次数已用完", 409)
        existing = next((item for item in session.recordings if item.attempt_number == attempt), None)
        if existing:
            return self._recording_out(existing)
        max_size = settings.upload_max_mb * 1024 * 1024
        content = await file.read(max_size + 1)
        if len(content) > max_size:
            raise AppError("FILE_TOO_LARGE", f"录音不能超过 {settings.upload_max_mb}MB", 413)
        if not content:
            raise AppError("EMPTY_FILE", "录音文件为空", 400)
        if not self._matches_audio_signature(mime_type, content):
            raise AppError("INVALID_AUDIO_FILE", "文件内容与音频格式不匹配", 415)
        storage_provider = settings.storage_backend.strip().lower()
        if storage_provider not in {"local", "oss"}:
            raise AppError("STORAGE_CONFIGURATION_ERROR", "录音存储配置无效", 503)

        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        stored_path = ""
        stored_local_path: Path | None = None
        uploaded_object_key: str | None = None
        with TemporaryDirectory(prefix="recording-", dir=upload_dir) as temp_dir:
            temp_path = Path(temp_dir)
            source_path = temp_path / f"source{self.allowed_mime_types[mime_type]}"
            target_path = temp_path / "recording.mp4"
            source_path.write_bytes(content)
            converted = self._convert_to_mp4(source_path, target_path)

            if storage_provider == "oss" and not converted:
                raise AppError("AUDIO_CONVERSION_UNAVAILABLE", "录音转码失败，请稍后重试", 503)

            if converted:
                payload_path = target_path
                filename = f"{uuid.uuid4().hex}.mp4"
                stored_mime_type = "audio/mp4"
            else:
                payload_path = source_path
                filename = f"{uuid.uuid4().hex}{self.allowed_mime_types[mime_type]}"
                stored_mime_type = mime_type
            stored_size = payload_path.stat().st_size

            if storage_provider == "oss":
                prefix = settings.oss_recording_prefix.strip("/") or "recordings"
                stored_path = f"{prefix}/{session.id}/{filename}"
                try:
                    self._oss_storage().put_bytes(stored_path, payload_path.read_bytes(), stored_mime_type)
                except AppError:
                    raise
                except Exception as error:
                    raise AppError("OSS_UPLOAD_FAILED", "录音上传到 OSS 失败，请重试", 503) from error
                uploaded_object_key = stored_path
            else:
                stored_local_path = upload_dir / filename
                payload_path.replace(stored_local_path)
                stored_path = filename

        for old in session.recordings:
            old.is_selected = False
        recording = Recording(
            session_id=session.id,
            storage_provider=storage_provider,
            file_path=stored_path,
            mime_type=stored_mime_type,
            size_bytes=stored_size,
            duration_seconds=duration_seconds,
            attempt_number=attempt,
            is_selected=True,
        )
        self.db.add(recording)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            if uploaded_object_key:
                try:
                    self._oss_storage().delete(uploaded_object_key)
                except Exception:
                    pass
            if stored_local_path:
                stored_local_path.unlink(missing_ok=True)
            raise
        self.db.refresh(recording)
        self.db.expire(session, ["recordings"])
        return self._recording_out(recording)

    def download_recording(self, user: User, recording_id: int) -> RecordingMedia:
        recording = self._recording(user, recording_id)
        if recording.storage_provider == "oss":
            if recording.mime_type != "audio/mp4" or not recording.file_path.lower().endswith(".mp4"):
                raise AppError("AUDIO_CONVERSION_UNAVAILABLE", "当前录音无法生成 MP4 文件", 503)
            return self._recording_media(recording, f"speaking-{recording.id}.mp4")

        recording, source_path = self._recording_file(user, recording_id)
        upload_dir = Path(settings.upload_dir)
        if recording.mime_type == "audio/mp4" and source_path.suffix.lower() == ".mp4":
            return self._recording_media(recording, f"speaking-{recording.id}.mp4")
        target_path = upload_dir / f"{uuid.uuid4().hex}.mp4"
        if not self._convert_to_mp4(source_path, target_path):
            raise AppError("AUDIO_CONVERSION_UNAVAILABLE", "当前环境无法生成 MP4 录音", 503)
        old_path = source_path
        recording.file_path = target_path.name
        recording.mime_type = "audio/mp4"
        recording.size_bytes = target_path.stat().st_size
        self.db.commit()
        if old_path != target_path:
            old_path.unlink(missing_ok=True)
        return self._recording_media(recording, f"speaking-{recording.id}.mp4")

    def stream_recording(self, user: User, recording_id: int) -> RecordingMedia:
        recording = self._recording(user, recording_id)
        suffix = Path(recording.file_path).suffix or self.allowed_mime_types.get(recording.mime_type, "")
        return self._recording_media(recording, f"recording-{recording.id}{suffix}")

    def _recording_file(self, user: User, recording_id: int) -> tuple[Recording, Path]:
        recording = self._recording(user, recording_id)
        if recording.storage_provider != "local":
            raise AppError("RECORDING_STORAGE_ERROR", "录音存储类型不匹配", 500)
        upload_dir = Path(settings.upload_dir).resolve()
        source_path = (upload_dir / recording.file_path).resolve()
        if upload_dir not in source_path.parents or not source_path.exists():
            raise AppError("RECORDING_FILE_MISSING", "录音文件不存在", 404)
        return recording, source_path

    def _recording(self, user: User, recording_id: int) -> Recording:
        recording = self.db.get(Recording, recording_id)
        if not recording:
            raise AppError("RECORDING_NOT_FOUND", "录音不存在", 404)
        session = self.sessions.get(recording.session_id)
        if not session:
            raise AppError("RECORDING_NOT_FOUND", "录音不存在", 404)
        if user.id != session.student_id and user.id != session.task.teacher_id:
            raise AppError("FORBIDDEN", "无权下载该录音", 403)
        return recording

    def _recording_media(self, recording: Recording, filename: str) -> RecordingMedia:
        if recording.storage_provider == "oss":
            try:
                body = self._oss_storage().open_stream(recording.file_path)
            except AppError:
                raise
            except Exception as error:
                raise AppError("RECORDING_FILE_MISSING", "OSS 录音文件不存在或暂时不可用", 404) from error
        else:
            upload_dir = Path(settings.upload_dir).resolve()
            source_path = (upload_dir / recording.file_path).resolve()
            if upload_dir not in source_path.parents or not source_path.exists():
                raise AppError("RECORDING_FILE_MISSING", "录音文件不存在", 404)
            body = self._file_chunks(source_path)
        return RecordingMedia(
            body=body,
            mime_type=recording.mime_type,
            size_bytes=recording.size_bytes,
            filename=filename,
        )

    @staticmethod
    def _file_chunks(path: Path, chunk_size: int = 256 * 1024) -> Iterator[bytes]:
        with path.open("rb") as source:
            while chunk := source.read(chunk_size):
                yield chunk

    @staticmethod
    def _oss_storage() -> OSSStorage:
        if not settings.oss_configured:
            raise AppError("OSS_NOT_CONFIGURED", "OSS 录音存储尚未配置", 503)
        try:
            return OSSStorage.from_settings(settings)
        except ValueError as error:
            raise AppError("OSS_NOT_CONFIGURED", "OSS 录音存储尚未配置", 503) from error

    def submit(self, student: User, session_id: int, data: SubmitSessionRequest) -> SessionOut:
        session = self._student_session(student.id, session_id, lock=True)
        if session.phase == SessionPhase.SUBMITTED:
            return self._out(session)
        if session.phase != SessionPhase.REVIEW:
            raise AppError("INVALID_PHASE", "训练尚未完成", 409)
        recording = next((x for x in session.recordings if x.id == data.recording_id), None)
        if not recording:
            raise AppError("RECORDING_REQUIRED", "请选择已上传的录音", 400)
        for item in session.recordings:
            item.is_selected = item.id == recording.id
        session.self_assessment = data.self_assessment.strip()
        session.phase = SessionPhase.SUBMITTED
        session.submitted_at = utc_now()
        if session.note:
            session.note.locked = True
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def evaluate(
        self, teacher: User, session_id: int, data: EvaluationCreate
    ) -> SessionOut:
        session = self.sessions.get(session_id, for_update=True)
        if not session or session.task.teacher_id != teacher.id:
            raise AppError("SESSION_NOT_FOUND", "提交不存在或无权访问", 404)
        if session.phase != SessionPhase.SUBMITTED:
            raise AppError("NOT_SUBMITTED", "学生尚未提交训练", 409)
        total = sum(
            [
                data.content_accuracy,
                data.logical_structure,
                data.fluency,
                data.vocabulary,
                data.time_control,
            ]
        )
        if session.evaluation:
            evaluation = session.evaluation
            for key, value in data.model_dump().items():
                setattr(evaluation, key, value)
            evaluation.total_score = total
            evaluation.published_at = utc_now()
        else:
            session.evaluation = Evaluation(
                teacher_id=teacher.id,
                total_score=total,
                published_at=utc_now(),
                **data.model_dump(),
            )
        self.db.commit()
        return self._out(self.sessions.get(session_id))

    def _student_session(self, student_id: int, session_id: int, lock: bool = False) -> TrainingSession:
        session = self.sessions.get(session_id, for_update=lock)
        if not session or session.student_id != student_id:
            raise AppError("SESSION_NOT_FOUND", "训练记录不存在", 404)
        return session

    def _accessible(self, user: User, session_id: int) -> TrainingSession:
        session = self.sessions.get(session_id)
        if not session:
            raise AppError("SESSION_NOT_FOUND", "训练记录不存在", 404)
        allowed = session.student_id == user.id or session.task.teacher_id == user.id
        if not allowed:
            raise AppError("FORBIDDEN", "无权访问该训练记录", 403)
        return session

    def _reconcile(self, session: TrainingSession) -> bool:
        now = utc_now()
        changed = False
        research_ends_at = aware(session.research_ends_at)
        if (
            session.phase == SessionPhase.RESEARCHING
            and research_ends_at is not None
            and now >= research_ends_at
        ):
            session.phase = SessionPhase.PREPARING
            session.preparation_started_at = research_ends_at
            session.preparation_ends_at = research_ends_at + timedelta(
                seconds=session.task.preparation_seconds
            )
            changed = True
        if session.phase == SessionPhase.SPEAKING and now >= aware(session.speaking_ends_at):
            session.phase = SessionPhase.REVIEW
            session.speaking_finished_at = aware(session.speaking_ends_at)
            changed = True
        return changed

    def _out(self, session: TrainingSession) -> SessionOut:
        latest = session.draws[-1] if session.draws else None
        return SessionOut(
            id=session.id,
            task_id=session.task_id,
            student_id=session.student_id,
            student_name=session.student.name,
            student_no=session.student.student_no,
            phase=session.phase,
            final_topic=TopicOut.model_validate(session.final_topic) if session.final_topic else None,
            current_draw=self._draw_out(latest, session.task.redraw_limit) if latest else None,
            draw_count=len(session.draws),
            redraws_remaining=max(0, session.task.redraw_limit + 1 - len(session.draws)),
            research_started_at=session.research_started_at,
            research_ends_at=session.research_ends_at,
            preparation_started_at=session.preparation_started_at,
            preparation_ends_at=session.preparation_ends_at,
            speaking_started_at=session.speaking_started_at,
            speaking_ends_at=session.speaking_ends_at,
            speaking_finished_at=session.speaking_finished_at,
            recording_attempts_started=session.recording_attempts_started,
            rerecords_remaining=max(
                0, session.task.rerecord_limit + 1 - session.recording_attempts_started
            ),
            submitted_at=session.submitted_at,
            note=session.note.content if session.note else "",
            note_locked=session.note.locked if session.note else False,
            self_assessment=session.self_assessment,
            recordings=[self._recording_out(x) for x in session.recordings],
            evaluation=EvaluationOut.model_validate(session.evaluation) if session.evaluation else None,
            task=task_out(session.task, session.student_id),
            server_time=utc_now(),
        )

    @staticmethod
    def _draw_out(record: TopicDrawRecord, redraw_limit: int) -> DrawOut:
        return DrawOut(
            id=record.id,
            draw_number=record.draw_number,
            confirmed=record.confirmed,
            topic=TopicOut.model_validate(record.topic),
            redraws_remaining=max(0, redraw_limit + 1 - record.draw_number),
        )

    @staticmethod
    def _recording_out(recording: Recording) -> RecordingOut:
        return RecordingOut(
            id=recording.id,
            url=f"/recordings/{recording.id}/stream",
            mime_type=recording.mime_type,
            size_bytes=recording.size_bytes,
            duration_seconds=recording.duration_seconds,
            attempt_number=recording.attempt_number,
            is_selected=recording.is_selected,
            download_url=f"/recordings/{recording.id}/download",
            stream_url=f"/recordings/{recording.id}/stream",
        )

    @staticmethod
    def _convert_to_mp4(source_path: Path, target_path: Path) -> bool:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            return False
        result = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(source_path),
                "-vn",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                str(target_path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        return result.returncode == 0 and target_path.exists() and target_path.stat().st_size > 0

    @staticmethod
    def _matches_audio_signature(mime_type: str, content: bytes) -> bool:
        if mime_type == "audio/webm":
            return content.startswith(b"\x1aE\xdf\xa3")
        if mime_type == "audio/ogg":
            return content.startswith(b"OggS")
        if mime_type in {"audio/wav", "audio/x-wav"}:
            return content.startswith(b"RIFF") and len(content) >= 12
        if mime_type in {"audio/mp4", "video/mp4"}:
            return len(content) >= 12 and content[4:8] == b"ftyp"
        if mime_type == "audio/mpeg":
            return content.startswith(b"ID3") or content.startswith(b"\xff")
        return False
