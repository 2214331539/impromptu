from datetime import timedelta

from app.db.base import utc_now
from app.models.entities import TrainingSession, Recording, SessionPhase, Evaluation, TrainingNote, TaskStatus, User, UserRole
from app.core.security import hash_password
from conftest import login_header
from app.services.training import TrainingService


def submitted(db, session_id):
    item = db.get(TrainingSession, session_id)
    item.phase = SessionPhase.SUBMITTED
    item.submitted_at = utc_now()
    item.recording_attempts_started = item.task.rerecord_limit + 1
    item.note = TrainingNote(content="Keep this note", locked=True)
    item.recordings.append(Recording(file_path="old.webm", mime_type="audio/webm", size_bytes=8,
                                    duration_seconds=2, attempt_number=item.recording_attempts_started, is_selected=True))
    item.evaluation = Evaluation(teacher_id=item.task.teacher_id, content_accuracy=10, logical_structure=10,
                                 fluency=10, vocabulary=10, time_control=10, total_score=50, comment="Old review", published_at=utc_now())
    db.commit()
    return item


def test_return_rerecord_upload_resubmit(client, course, session, db_session, monkeypatch):
    item = submitted(db_session, session["id"])
    original_id = item.recordings[0].id
    url = f"/api/v1/sessions/{item.id}"
    teacher, student = course["teacher"], course["student"]
    returned = client.post(url + "/return", headers=teacher, json={"reason": "录音误交，请重录"})
    assert returned.status_code == 200, returned.text
    result = returned.json()
    assert result["phase"] == "review" and result["submitted_at"] is None
    assert result["evaluation"] is None and result["return_history"][0]["evaluation"]["total_score"] == 50
    assert result["return_history"][0]["recording_id"] == original_id
    assert result["note"] == "Keep this note" and not result["note_locked"]
    assert result["rerecords_remaining"] == 1
    tasks = client.get("/api/v1/tasks", headers=student).json()
    assert next(t for t in tasks if t["id"] == item.task_id)["my_return_pending"]
    assert client.post(url + "/return", headers=teacher, json={"reason": "again"}).status_code == 409
    score = dict(content_accuracy=10, logical_structure=10, fluency=10, vocabulary=10, time_control=10, comment="test")
    assert client.put(url + "/evaluation", headers=teacher, json=score).status_code == 409
    assert client.post(url + "/retry-speaking", headers=student).status_code == 200
    assert client.post(url + "/finish-speaking", headers=student).status_code == 200
    monkeypatch.setattr(TrainingService, "_convert_to_mp4", staticmethod(lambda *args: False))
    uploaded = client.post(url + "/recordings", headers=student, files={"file": ("new.webm", b"\x1aE\xdf\xa3test", "audio/webm")}, data={"duration_seconds": "2"})
    assert uploaded.status_code in (200, 201), uploaded.text
    assert uploaded.json()["id"] != original_id
    assert client.post(url + "/retry-speaking", headers=student).status_code == 409
    done = client.post(url + "/submit", headers=student, json={"recording_id": uploaded.json()["id"]})
    assert done.status_code == 200 and done.json()["phase"] == "submitted"
    assert len(done.json()["recordings"]) == 2 and len(done.json()["return_history"]) == 1
    assert client.put(url + "/evaluation", headers=teacher, json=score).status_code == 200
    again = client.post(url + "/return", headers=teacher, json={"reason": "第二次退回"})
    assert again.status_code == 200 and len(again.json()["return_history"]) == 2
    assert again.json()["rerecords_remaining"] == 1


def test_return_permissions_and_validation(client, course, session, db_session):
    item = submitted(db_session, session["id"])
    url = f"/api/v1/sessions/{item.id}/return"
    assert client.post(url, headers=course["student"], json={"reason": "test"}).status_code == 403
    db_session.add(User(student_no="T_RETURN_OTHER", name="Other teacher", password_hash=hash_password("password123"), role=UserRole.TEACHER))
    db_session.commit()
    other = login_header(client, "T_RETURN_OTHER")
    assert client.post(url, headers=other, json={"reason": "test"}).status_code == 404
    assert client.post(url, headers=course["teacher"], json={"reason": "  "}).status_code == 400
    assert client.post(url, headers=course["teacher"], json={"reason": "x" * 1001}).status_code == 422
    item.task.status = TaskStatus.CLOSED
    db_session.commit()
    assert client.post(url, headers=course["teacher"], json={"reason": "test"}).status_code == 409
    item.task.status = TaskStatus.PUBLISHED
    item.task.due_at = utc_now() - timedelta(seconds=1)
    db_session.commit()
    assert client.post(url, headers=course["teacher"], json={"reason": "test"}).status_code == 409
    db_session.refresh(item)
    assert item.phase == SessionPhase.SUBMITTED and item.evaluation is not None
    assert item.return_history == []


def test_return_original_recording_can_be_resubmitted(client, course, session, db_session):
    item = submitted(db_session, session["id"])
    url = f"/api/v1/sessions/{item.id}"
    original_id = item.recordings[0].id
    assert client.post(url + "/return", headers=course["teacher"], json={"reason": "请核对自评"}).status_code == 200
    result = client.post(url + "/submit", headers=course["student"], json={"recording_id": original_id, "self_assessment": "修改后的自评"})
    assert result.status_code == 200
    assert result.json()["self_assessment"] == "修改后的自评"
    assert result.json()["note_locked"]
