from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
import wave

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.entities import EmailCode, Recording, TrainingSession
from app.services.topic_import import TopicImportService
from app.services.training import TrainingService


def test_authentication_and_role_permissions(client: TestClient, course):
    me = client.get("/api/v1/auth/me", headers=course["student"])
    assert me.status_code == 200
    assert me.json()["role"] == "student"
    forbidden = client.post("/api/v1/classes", headers=course["student"], json={"name": "No"})
    assert forbidden.status_code == 403
    hidden = client.get(
        f"/api/v1/classes/{course['classroom']['id']}/members",
        headers=course["other_student"],
    )
    assert hidden.status_code == 403


def test_user_can_change_password(client: TestClient, course):
    wrong_current = client.post(
        "/api/v1/auth/change-password",
        headers=course["student"],
        json={"current_password": "wrong-password", "new_password": "newpass123"},
    )
    assert wrong_current.status_code == 400

    changed = client.post(
        "/api/v1/auth/change-password",
        headers=course["student"],
        json={"current_password": "password123", "new_password": "newpass123"},
    )
    assert changed.status_code == 204

    old_login = client.post("/api/v1/auth/login", json={"student_no": "900001", "password": "password123"})
    assert old_login.status_code == 401
    new_login = client.post("/api/v1/auth/login", json={"student_no": "900001", "password": "newpass123"})
    assert new_login.status_code == 200


def set_test_email_code(db_session: Session, email: str, purpose: str, account: str) -> None:
    item = db_session.scalar(
        select(EmailCode)
        .where(
            EmailCode.email == email,
            EmailCode.purpose == purpose,
            EmailCode.account == account.upper(),
        )
        .order_by(EmailCode.created_at.desc())
    )
    assert item is not None
    item.code_hash = hash_password("111111")
    db_session.commit()


def test_public_registration_only_creates_students(client: TestClient, db_session: Session):
    rejected = client.post(
        "/api/v1/auth/register",
        json={
            "student_no": "T7001",
            "email": "teacher-self@example.test",
            "email_code": "111111",
            "name": "Self registered teacher",
            "password": "password123",
            "role": "teacher",
        },
    )
    assert rejected.status_code == 422
    code = client.post(
        "/api/v1/auth/register/email-code",
        json={"student_no": "STU_7001", "email": "student7001@example.test"},
    )
    assert code.status_code == 204, code.text
    set_test_email_code(db_session, "student7001@example.test", "register", "STU_7001")
    created = client.post(
        "/api/v1/auth/register",
        json={
            "student_no": "STU_7001",
            "email": "student7001@example.test",
            "email_code": "111111",
            "name": "Student",
            "password": "password123",
        },
    )
    assert created.status_code == 201
    assert created.json()["user"]["role"] == "student"
    assert created.json()["user"]["email_verified"] is True
    invalid = client.post(
        "/api/v1/auth/register",
        json={
            "student_no": "AB",
            "email": "invalid@example.test",
            "email_code": "111111",
            "name": "Student",
            "password": "password123",
        },
    )
    assert invalid.status_code == 422


def test_password_reset_uses_account_email_and_code(client: TestClient, course, db_session: Session):
    requested = client.post(
        "/api/v1/auth/password-reset/email-code",
        json={"student_no": "900001", "email": "900001@example.test"},
    )
    assert requested.status_code == 204, requested.text
    set_test_email_code(db_session, "900001@example.test", "password_reset", "900001")
    reset = client.post(
        "/api/v1/auth/password-reset",
        json={
            "student_no": "900001",
            "email": "900001@example.test",
            "email_code": "111111",
            "new_password": "reset123",
        },
    )
    assert reset.status_code == 204, reset.text
    old_login = client.post("/api/v1/auth/login", json={"student_no": "900001", "password": "password123"})
    assert old_login.status_code == 401
    new_login = client.post("/api/v1/auth/login", json={"student_no": "900001", "password": "reset123"})
    assert new_login.status_code == 200


def test_email_code_send_has_sixty_second_interval(client: TestClient, course):
    requested = client.post(
        "/api/v1/auth/password-reset/email-code",
        json={"student_no": "900001", "email": "900001@example.test"},
    )
    assert requested.status_code == 204, requested.text
    repeated = client.post(
        "/api/v1/auth/password-reset/email-code",
        json={"student_no": "900001", "email": "900001@example.test"},
    )
    assert repeated.status_code == 429
    assert repeated.json()["error"]["code"] == "EMAIL_CODE_TOO_FREQUENT"


def test_admin_creates_managed_accounts_and_controls_access(client: TestClient, course):
    forbidden = client.get("/api/v1/admin/users", headers=course["teacher"])
    assert forbidden.status_code == 403
    created = client.post(
        "/api/v1/admin/users",
        headers=course["admin"],
        json={
            "student_no": "A9002",
            "email": "admin2@example.test",
            "name": "Second Admin",
            "password": "password123",
            "role": "admin",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["role"] == "admin"
    users = client.get("/api/v1/admin/users", headers=course["admin"])
    assert users.status_code == 200
    assert any(item["student_no"] == "T9001" for item in users.json())
    teacher_id = next(item["id"] for item in users.json() if item["student_no"] == "T9001")
    classroom = client.post(
        "/api/v1/admin/classes",
        headers=course["admin"],
        json={"name": "Admin managed class", "teacher_id": teacher_id},
    )
    assert classroom.status_code == 201, classroom.text
    disabled = client.patch(
        f"/api/v1/admin/classes/{classroom.json()['id']}",
        headers=course["admin"],
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False
    created_student = client.post(
        "/api/v1/admin/users",
        headers=course["admin"],
        json={
            "student_no": "910003",
            "email": "removable@example.test",
            "name": "Removable Student",
            "password": "password123",
            "role": "student",
        },
    )
    assert created_student.status_code == 201, created_student.text
    delete_self = client.delete("/api/v1/admin/users/1", headers=course["admin"])
    assert delete_self.status_code == 409
    removed = client.delete(f"/api/v1/admin/users/{created_student.json()['id']}", headers=course["admin"])
    assert removed.status_code == 204
    users_after_delete = client.get("/api/v1/admin/users", headers=course["admin"])
    assert all(item["student_no"] != "910003" for item in users_after_delete.json())
    reset = client.post(
        f"/api/v1/admin/users/{teacher_id}/reset-password",
        headers=course["admin"],
        json={"password": "teacher456"},
    )
    assert reset.status_code == 200
    old_teacher_login = client.post("/api/v1/auth/login", json={"student_no": "T9001", "password": "password123"})
    assert old_teacher_login.status_code == 401
    new_teacher_login = client.post("/api/v1/auth/login", json={"student_no": "T9001", "password": "teacher456"})
    assert new_teacher_login.status_code == 200
    reset_self = client.post(
        "/api/v1/admin/users/1/reset-password",
        headers=course["admin"],
        json={"password": "admin456"},
    )
    assert reset_self.status_code == 409


def test_teacher_can_import_ai_topic_bank_preview_and_commit(client: TestClient, course, monkeypatch):
    monkeypatch.setattr(settings, "openai_model", "test-model")
    monkeypatch.setattr(settings, "openai_base_url", "https://example.test")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")

    def fake_request_ai(self, *, source, requested_name, requested_description):
        assert "Growth Mindset" in source
        return SimpleNamespace(
            topics=[
                "Growth Mindset",
                "Cognitive Dissonance",
                "Growth Mindset",
                "Delayed Gratifcation",
            ],
            warnings=[],
        )

    monkeypatch.setattr(TopicImportService, "_request_ai", fake_request_ai)
    preview = client.post(
        "/api/v1/topic-banks/import-preview",
        headers=course["teacher"],
        data={"name": "Imported Bank", "raw_text": "Growth Mindset\nCognitive Dissonance\nDelayed Gratifcation"},
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["name"] == "Imported Bank"
    assert body["description"] == ""
    assert len(body["topics"]) == 3
    assert body["topics"][0]["prompt"] == "Growth Mindset"
    assert body["topics"][0]["category"] == "Topic"
    assert body["topics"][0]["tags"] == ""

    committed = client.post(
        "/api/v1/topic-banks/import-commit",
        headers=course["teacher"],
        json={
            "name": body["name"],
            "description": body["description"],
            "topics": body["topics"],
        },
    )
    assert committed.status_code == 201, committed.text
    committed_body = committed.json()
    assert committed_body["bank"]["name"] == "Imported Bank"
    assert committed_body["bank"]["topic_count"] == 3
    assert len(committed_body["topics"]) == 3
    assert committed_body["topics"][2]["prompt"] == "Delayed Gratifcation"
    assert committed_body["topics"][2]["tags"] == ""

    forbidden = client.post(
        "/api/v1/topic-banks/import-preview",
        headers=course["student"],
        data={"raw_text": "student should not import topics"},
    )
    assert forbidden.status_code == 403


def test_topic_bank_delete(client: TestClient, course):
    teacher = course["teacher"]

    # 被任务引用的题库：拒绝删除，保护训练历史
    referenced = client.delete(f"/api/v1/topic-banks/{course['bank']['id']}", headers=teacher)
    assert referenced.status_code == 409

    # 未被引用的题库：直接删除，连同题目一起移除
    fresh = client.post(
        "/api/v1/topic-banks", headers=teacher, json={"name": "Disposable", "description": ""}
    ).json()
    added = client.post(
        f"/api/v1/topic-banks/{fresh['id']}/topics",
        headers=teacher,
        json={"prompt": "A disposable speaking topic.", "category": "Test", "difficulty": "easy", "tags": ""},
    )
    assert added.status_code == 201
    removed = client.delete(f"/api/v1/topic-banks/{fresh['id']}", headers=teacher)
    assert removed.status_code == 204
    after = client.get("/api/v1/topic-banks", headers=teacher).json()
    assert all(item["id"] != fresh["id"] for item in after)
    gone = client.get(f"/api/v1/topic-banks/{fresh['id']}/topics", headers=teacher)
    assert gone.status_code == 404

    # 学生无权删除题库
    forbidden = client.delete(f"/api/v1/topic-banks/{course['bank']['id']}", headers=course["student"])
    assert forbidden.status_code == 403


def test_random_draw_limit_is_persistent(client: TestClient, course, session):
    url = f"/api/v1/sessions/{session['id']}/draw"
    blocked = client.post(url, headers=course["student"])
    assert blocked.status_code == 409
    completed = client.post(
        f"/api/v1/sessions/{session['id']}/complete-mic-check", headers=course["student"]
    )
    assert completed.status_code == 200
    assert completed.json()["phase"] == "drawing"
    first = client.post(url, headers=course["student"])
    second = client.post(url, headers=course["student"])
    third = client.post(url, headers=course["student"])
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["topic"]["id"] != second.json()["topic"]["id"]
    assert third.status_code == 409
    assert third.json()["error"]["code"] == "REDRAW_LIMIT"


def test_confirm_starts_research_after_microphone_check(client: TestClient, course, session):
    assert session["phase"] == "mic_check"
    client.post(
        f"/api/v1/sessions/{session['id']}/complete-mic-check", headers=course["student"]
    )
    client.post(f"/api/v1/sessions/{session['id']}/draw", headers=course["student"])
    confirmed = client.post(
        f"/api/v1/sessions/{session['id']}/confirm-topic", headers=course["student"]
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["phase"] == "researching"
    assert body["research_ends_at"] is not None
    assert body["preparation_ends_at"] is None
    started = client.post(f"/api/v1/sessions/{session['id']}/start-preparation", headers=course["student"])
    assert started.status_code == 200
    assert started.json()["phase"] == "preparing"
    assert started.json()["preparation_ends_at"] is not None
    locked = client.post(f"/api/v1/sessions/{session['id']}/draw", headers=course["student"])
    assert locked.status_code == 409


def test_countdown_phase_recovers_from_server_end_time(
    client: TestClient, course, session, db_session: Session
):
    client.post(
        f"/api/v1/sessions/{session['id']}/complete-mic-check", headers=course["student"]
    )
    client.post(f"/api/v1/sessions/{session['id']}/draw", headers=course["student"])
    client.post(f"/api/v1/sessions/{session['id']}/confirm-topic", headers=course["student"])
    model = db_session.get(TrainingSession, session["id"])
    model.research_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    restored = client.get(f"/api/v1/sessions/{session['id']}", headers=course["student"])
    assert restored.status_code == 200
    assert restored.json()["phase"] == "preparing"
    assert restored.json()["preparation_ends_at"]
    assert restored.json()["recording_attempts_started"] == 0

    too_early = client.post(f"/api/v1/sessions/{session['id']}/start-speaking", headers=course["student"])
    assert too_early.status_code == 409
    model = db_session.get(TrainingSession, session["id"])
    model.preparation_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    saved = client.patch(
        f"/api/v1/sessions/{session['id']}/note",
        headers=course["student"],
        json={"content": "Opening, evidence, conclusion"},
    )
    assert saved.status_code == 200

    started = client.post(f"/api/v1/sessions/{session['id']}/start-speaking", headers=course["student"])
    assert started.status_code == 200
    assert started.json()["phase"] == "speaking"
    assert started.json()["recording_attempts_started"] == 1
    assert started.json()["note"] == "Opening, evidence, conclusion"

    model = db_session.get(TrainingSession, session["id"])
    model.speaking_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    finished = client.get(f"/api/v1/sessions/{session['id']}", headers=course["student"])
    assert finished.json()["phase"] == "review"


def wav_recording() -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 800)
    return output.getvalue()


def complete_submission(client: TestClient, course, session, db_session: Session, include_note=True):
    base = f"/api/v1/sessions/{session['id']}"
    client.post(f"{base}/complete-mic-check", headers=course["student"])
    client.post(f"{base}/draw", headers=course["student"])
    client.post(f"{base}/confirm-topic", headers=course["student"])
    model = db_session.get(TrainingSession, session["id"])
    model.research_ends_at = datetime.now(timezone.utc) - timedelta(seconds=11)
    db_session.commit()
    client.get(base, headers=course["student"])
    if include_note:
        client.patch(f"{base}/note", headers=course["student"], json={"content": "Point one and point two"})
    client.post(f"{base}/start-speaking", headers=course["student"])
    client.post(f"{base}/finish-speaking", headers=course["student"])
    upload = client.post(
        f"{base}/recordings",
        headers=course["student"],
        files={"file": ("speech.wav", wav_recording(), "audio/wav")},
        data={"duration_seconds": "8.5"},
    )
    assert upload.status_code == 200, upload.text
    submitted = client.post(
        f"{base}/submit",
        headers=course["student"],
        json={"self_assessment": "Clear structure", "recording_id": upload.json()["id"]},
    )
    return submitted


def test_training_upload_and_submit_are_idempotent(client: TestClient, course, session, db_session):
    submitted = complete_submission(client, course, session, db_session)
    assert submitted.status_code == 200
    assert submitted.json()["phase"] == "submitted"
    repeated = client.post(
        f"/api/v1/sessions/{session['id']}/submit",
        headers=course["student"],
        json={"self_assessment": "Again", "recording_id": submitted.json()["recordings"][0]["id"]},
    )
    assert repeated.status_code == 200
    assert repeated.json()["submitted_at"] == submitted.json()["submitted_at"]


def test_training_submission_does_not_require_preparation_note(client: TestClient, course, session, db_session):
    submitted = complete_submission(client, course, session, db_session, include_note=False)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["phase"] == "submitted"


def test_recording_stream_is_available_to_student_and_teacher(client: TestClient, course, session, db_session):
    submitted = complete_submission(client, course, session, db_session)
    recording_id = submitted.json()["recordings"][0]["id"]
    url = f"/api/v1/recordings/{recording_id}/stream"
    student_stream = client.get(url, headers=course["student"])
    teacher_stream = client.get(url, headers=course["teacher"])
    other_stream = client.get(url, headers=course["other_student"])
    anonymous_stream = client.get(url)
    assert student_stream.status_code == 200
    assert teacher_stream.status_code == 200
    assert student_stream.headers["content-type"].startswith("audio/")
    assert teacher_stream.content == student_stream.content
    assert other_stream.status_code == 403
    assert anonymous_stream.status_code == 401


def test_new_recording_can_be_stored_and_streamed_from_oss(
    client: TestClient, course, session, db_session, monkeypatch
):
    class MemoryOSS:
        def __init__(self):
            self.objects: dict[str, bytes] = {}

        def put_bytes(self, object_key: str, content: bytes, content_type: str) -> None:
            assert content_type == "audio/mp4"
            self.objects[object_key] = content

        def open_stream(self, object_key: str):
            return iter([self.objects[object_key]])

        def delete(self, object_key: str) -> None:
            self.objects.pop(object_key, None)

    storage = MemoryOSS()
    monkeypatch.setattr(TrainingService, "_oss_storage", staticmethod(lambda: storage))
    monkeypatch.setattr(
        TrainingService,
        "_convert_to_mp4",
        staticmethod(lambda source_path, target_path: target_path.write_bytes(b"\x00\x00\x00\x18ftypmp42") > 0),
    )
    settings.storage_backend = "oss"

    submitted = complete_submission(client, course, session, db_session)
    assert submitted.status_code == 200, submitted.text
    recording_id = submitted.json()["recordings"][0]["id"]
    recording = db_session.get(Recording, recording_id)
    assert recording.storage_provider == "oss"
    assert recording.file_path.startswith("recordings/")
    assert recording.file_path in storage.objects
    assert not list(Path(settings.upload_dir).glob("*.mp4"))

    streamed = client.get(
        f"/api/v1/recordings/{recording_id}/stream", headers=course["student"]
    )
    assert streamed.status_code == 200
    assert streamed.content == storage.objects[recording.file_path]


def test_teacher_evaluation_and_ownership(client: TestClient, course, session, db_session):
    submitted = complete_submission(client, course, session, db_session)
    assert submitted.status_code == 200, submitted.text
    payload = {
        "content_accuracy": 17,
        "logical_structure": 18,
        "fluency": 16,
        "vocabulary": 15,
        "time_control": 19,
        "comment": "Good organization and clear examples.",
    }
    forbidden = client.put(
        f"/api/v1/sessions/{session['id']}/evaluation",
        headers=course["student"],
        json=payload,
    )
    assert forbidden.status_code == 403
    evaluated = client.put(
        f"/api/v1/sessions/{session['id']}/evaluation",
        headers=course["teacher"],
        json=payload,
    )
    assert evaluated.status_code == 200, evaluated.text
    assert evaluated.json()["evaluation"]["total_score"] == 85
