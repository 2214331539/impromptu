from datetime import datetime, timedelta

import pytest

from app.db.base import utc_now
from app.models.entities import TrainingTask, TrainingSession, WritingAssignment, SessionPhase
from app.services.training import aware
from test_core_flow import complete_submission, wav_recording
from test_task_adjustments import writing_payload


def expire(task):
    task.starts_at = utc_now() - timedelta(days=2)
    task.due_at = utc_now() - timedelta(days=1)


def test_oral_can_start_complete_return_and_resubmit_after_deadline(client, course, db_session):
    task = db_session.get(TrainingTask, course["task"]["id"])
    expire(task)
    db_session.commit()
    url = f"/api/v1/tasks/{task.id}"
    assert client.post(url + "/sessions", headers=course["other_student"]).status_code == 403
    started = client.post(url + "/sessions", headers=course["student"])
    assert started.status_code == 200, started.text
    session = started.json()
    resumed = client.post(url + "/sessions", headers=course["student"])
    assert resumed.json()["id"] == session["id"]
    assert task.id in [t["id"] for t in client.get("/api/v1/dashboard", headers=course["student"]).json()["pending_tasks"]]
    done = complete_submission(client, course, session, db_session)
    assert done.status_code == 200, done.text
    assert aware(datetime.fromisoformat(done.json()["submitted_at"])) > aware(task.due_at)
    base = f"/api/v1/sessions/{session['id']}"
    returned = client.post(base + "/return", headers=course["teacher"], json={"reason": "Please re-record."})
    assert returned.status_code == 200, returned.text
    assert client.post(base + "/retry-speaking", headers=course["student"]).status_code == 200
    assert client.post(base + "/finish-speaking", headers=course["student"]).status_code == 200
    upload = client.post(base + "/recordings", headers=course["student"],
                         files={"file": ("speech.wav", wav_recording(), "audio/wav")}, data={"duration_seconds": "8.5"})
    assert upload.status_code == 200, upload.text
    resubmitted = client.post(base + "/submit", headers=course["student"], json={"recording_id": upload.json()["id"]})
    assert resubmitted.status_code == 200
    assert len(resubmitted.json()["recordings"]) == 2


def test_oral_in_progress_can_finish_after_deadline_but_manual_close_blocks(client, course, session, db_session):
    done = complete_submission(client, course, session, db_session)
    assert done.status_code == 200
    item = db_session.get(TrainingSession, session["id"])
    item.phase = SessionPhase.REVIEW
    item.submitted_at = None
    expire(item.task)
    db_session.commit()
    base = f"/api/v1/sessions/{item.id}"
    task_url = f"/api/v1/tasks/{item.task_id}"
    client.post(task_url + "/close", headers=course["teacher"])
    payload = {"recording_id": done.json()["recordings"][0]["id"]}
    assert client.post(base + "/submit", headers=course["student"], json=payload).status_code == 409
    assert client.post(task_url + "/sessions", headers=course["student"]).status_code == 404
    client.post(task_url + "/publish", headers=course["teacher"])
    submitted = client.post(base + "/submit", headers=course["student"], json=payload)
    assert submitted.status_code == 200, submitted.text


@pytest.mark.parametrize("already_started", [False, True])
def test_writing_legacy_task_can_start_save_and_submit_late(client, course, db_session, already_started):
    created = client.post("/api/v1/writing/assignments", headers=course["teacher"],
                          json=writing_payload(course, allow_late_submission=False, revision_limit=0))
    assert created.status_code == 201
    aid = created.json()["id"]
    url = f"/api/v1/writing/assignments/{aid}"
    client.post(url + "/publish", headers=course["teacher"])
    original = client.post(url + "/submissions", headers=course["student"]).json() if already_started else None
    task = db_session.get(WritingAssignment, aid)
    expire(task)
    task.allow_late_submission = False  # Historical database values must work too.
    db_session.commit()
    assert client.get(url, headers=course["student"]).json()["allow_late_submission"] is True
    assert client.post(url + "/submissions", headers=course["other_student"]).status_code == 403
    started = client.post(url + "/submissions", headers=course["student"])
    assert started.status_code == 200, started.text
    if original:
        assert started.json()["id"] == original["id"]
    base = f"/api/v1/writing/submissions/{started.json()['id']}"
    assert client.patch(base + "/draft", headers=course["student"], json={"content": "A late essay."}).status_code == 200
    client.post(url + "/close", headers=course["teacher"])
    body = {"content": "A late essay.", "client_submit_id": "late-essay-unique-1"}
    assert client.post(base + "/submit", headers=course["student"], json=body).status_code == 409
    assert client.patch(base + "/draft", headers=course["student"], json={"content": "No"}).status_code == 409
    client.post(url + "/publish", headers=course["teacher"])
    done = client.post(base + "/submit", headers=course["student"], json=body)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "finalized"
    assert aware(datetime.fromisoformat(done.json()["final_submitted_at"])) > aware(task.due_at)
    assert client.post(base + "/submit", headers=course["student"], json=body).json()["revisions"] == done.json()["revisions"]
    assert client.patch(base + "/draft", headers=course["student"], json={"content": "Overwrite"}).status_code == 409
