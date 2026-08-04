from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.entities import TrainingSession


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


def test_random_draw_limit_is_persistent(client: TestClient, course, session):
    url = f"/api/v1/sessions/{session['id']}/draw"
    first = client.post(url, headers=course["student"])
    second = client.post(url, headers=course["student"])
    third = client.post(url, headers=course["student"])
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["topic"]["id"] != second.json()["topic"]["id"]
    assert third.status_code == 409
    assert third.json()["error"]["code"] == "REDRAW_LIMIT"


def test_confirm_locks_topic_and_waits_for_microphone_check(client: TestClient, course, session):
    client.post(f"/api/v1/sessions/{session['id']}/draw", headers=course["student"])
    confirmed = client.post(
        f"/api/v1/sessions/{session['id']}/confirm-topic", headers=course["student"]
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["phase"] == "mic_check"
    assert body["preparation_ends_at"] is None
    started = client.post(f"/api/v1/sessions/{session['id']}/start-preparation", headers=course["student"])
    assert started.status_code == 200
    assert started.json()["phase"] == "preparing"
    assert started.json()["preparation_ends_at"]
    locked = client.post(f"/api/v1/sessions/{session['id']}/draw", headers=course["student"])
    assert locked.status_code == 409


def test_countdown_phase_recovers_from_server_end_time(
    client: TestClient, course, session, db_session: Session
):
    client.post(f"/api/v1/sessions/{session['id']}/draw", headers=course["student"])
    client.post(f"/api/v1/sessions/{session['id']}/confirm-topic", headers=course["student"])
    client.post(f"/api/v1/sessions/{session['id']}/start-preparation", headers=course["student"])
    model = db_session.get(TrainingSession, session["id"])
    model.preparation_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    restored = client.get(f"/api/v1/sessions/{session['id']}", headers=course["student"])
    assert restored.status_code == 200
    assert restored.json()["phase"] == "speaking"
    assert restored.json()["recording_attempts_started"] == 1

    model = db_session.get(TrainingSession, session["id"])
    model.speaking_ends_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    finished = client.get(f"/api/v1/sessions/{session['id']}", headers=course["student"])
    assert finished.json()["phase"] == "review"


def complete_submission(client: TestClient, course, session, include_note=True):
    base = f"/api/v1/sessions/{session['id']}"
    client.post(f"{base}/draw", headers=course["student"])
    client.post(f"{base}/confirm-topic", headers=course["student"])
    client.post(f"{base}/start-preparation", headers=course["student"])
    if include_note:
        client.patch(f"{base}/note", headers=course["student"], json={"content": "Point one and point two"})
    client.post(f"{base}/start-speaking", headers=course["student"])
    client.post(f"{base}/finish-speaking", headers=course["student"])
    upload = client.post(
        f"{base}/recordings",
        headers=course["student"],
        files={"file": ("speech.wav", b"RIFF" + b"\x00" * 128, "audio/wav")},
        data={"duration_seconds": "8.5"},
    )
    assert upload.status_code == 200, upload.text
    submitted = client.post(
        f"{base}/submit",
        headers=course["student"],
        json={"self_assessment": "Clear structure", "recording_id": upload.json()["id"]},
    )
    return submitted


def test_training_upload_and_submit_are_idempotent(client: TestClient, course, session):
    submitted = complete_submission(client, course, session)
    assert submitted.status_code == 200
    assert submitted.json()["phase"] == "submitted"
    repeated = client.post(
        f"/api/v1/sessions/{session['id']}/submit",
        headers=course["student"],
        json={"self_assessment": "Again", "recording_id": submitted.json()["recordings"][0]["id"]},
    )
    assert repeated.status_code == 200
    assert repeated.json()["submitted_at"] == submitted.json()["submitted_at"]


def test_training_submission_does_not_require_preparation_note(client: TestClient, course, session):
    submitted = complete_submission(client, course, session, include_note=False)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["phase"] == "submitted"


def test_teacher_evaluation_and_ownership(client: TestClient, course, session):
    submitted = complete_submission(client, course, session)
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
