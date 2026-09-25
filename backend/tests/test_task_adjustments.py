from datetime import datetime, timedelta, timezone

from app.core.security import hash_password
from app.db.base import utc_now
from app.models.entities import User, UserRole
from conftest import login_header


def oral_payload(task, **changes):
    keys = ("name", "description", "class_id", "topic_bank_id", "research_seconds", "preparation_seconds", "speaking_seconds", "starts_at", "due_at", "redraw_limit", "rerecord_limit", "notes_required", "allow_early_finish")
    payload = {**{key: task[key] for key in keys}, **changes}
    # SQLite drops timezone metadata; requests must still contain explicit UTC offsets.
    for key in ("starts_at", "due_at"):
        value = datetime.fromisoformat(payload[key])
        payload[key] = value.replace(tzinfo=value.tzinfo or timezone.utc).isoformat()
    return payload


def writing_payload(course, **changes):
    return {"title": "Writing practice", "instructions": "Write about school", "class_id": course["classroom"]["id"], "starts_at": (utc_now() - timedelta(days=1)).isoformat(), "due_at": (utc_now() + timedelta(days=7)).isoformat(), "grammar_hint_mode": "off", "revision_limit": 1, **changes}


def test_append_topics_repeatedly_with_only_names(client, course):
    url = f"/api/v1/topic-banks/{course['bank']['id']}/topics/batch"
    first = client.post(url, headers=course["teacher"], json={"topics": [{"prompt": "家"}, {"prompt": "School"}, {"prompt": "school"}]})
    assert first.status_code == 200, first.text
    assert [t["prompt"] for t in first.json()["topics"]] == ["家", "School"]
    second = client.post(url, headers=course["teacher"], json={"topics": [{"prompt": "School"}, {"prompt": "Travel"}]})
    assert second.status_code == 200
    assert len(second.json()["topics"]) == 1
    assert second.json()["bank"]["topic_count"] == 6
    assert client.post(url, headers=course["student"], json={"topics": [{"prompt": "No"}]}).status_code == 403
    assert client.post(url, headers=course["teacher"], json={"topics": [{"prompt": "Valid"}, {"prompt": "  "}]}).status_code == 400
    assert len(client.get(url.removesuffix("/batch"), headers=course["teacher"]).json()) == 6


def test_edit_close_reopen_oral_task_preserves_progress(client, course, session):
    teacher, student = course["teacher"], course["student"]
    task_id, session_id = course["task"]["id"], session["id"]
    base = f"/api/v1/sessions/{session_id}"
    assert client.post(base + "/complete-mic-check", headers=student).status_code == 200
    drawn = client.post(base + "/draw", headers=student).json()
    confirmed = client.post(base + "/confirm-topic", headers=student).json()
    payload = oral_payload(course["task"], name="Updated oral task", research_seconds=120)
    edited = client.put(f"/api/v1/tasks/{task_id}", headers=teacher, json=payload)
    assert edited.status_code == 200, edited.text
    restored = client.get(base, headers=student).json()
    assert restored["final_topic"]["id"] == drawn["topic"]["id"]
    assert restored["research_ends_at"].rstrip("Z") == confirmed["research_ends_at"].rstrip("Z")
    assert client.put(f"/api/v1/tasks/{task_id}", headers=student, json=payload).status_code == 403
    classroom = client.post("/api/v1/classes", headers=teacher, json={"name": "Another class"}).json()
    assert client.put(f"/api/v1/tasks/{task_id}", headers=teacher, json={**payload, "class_id": classroom["id"]}).status_code == 409
    assert client.post(f"/api/v1/tasks/{task_id}/close", headers=teacher).status_code == 200
    assert client.patch(base + "/note", headers=student, json={"content": "closed"}).status_code == 409
    assert client.post(f"/api/v1/tasks/{task_id}/publish", headers=teacher).status_code == 200
    assert client.patch(base + "/note", headers=student, json={"content": "saved draft"}).status_code == 200


def test_join_class_exposes_both_task_types(client, course):
    writing = client.post("/api/v1/writing/assignments", headers=course["teacher"], json=writing_payload(course)).json()
    client.post(f"/api/v1/writing/assignments/{writing['id']}/publish", headers=course["teacher"])
    student = course["other_student"]
    assert client.get("/api/v1/tasks", headers=student).json() == []
    assert client.get("/api/v1/writing/assignments", headers=student).json() == []
    assert client.post("/api/v1/classes/join", headers=student, json={"invite_code": course["classroom"]["invite_code"]}).status_code == 200
    assert course["task"]["id"] in [x["id"] for x in client.get("/api/v1/tasks", headers=student).json()]
    assert writing["id"] in [x["id"] for x in client.get("/api/v1/writing/assignments", headers=student).json()]


def test_edit_close_reopen_writing_and_final_submit_retry(client, course):
    teacher, student = course["teacher"], course["student"]
    payload = writing_payload(course, revision_limit=0)
    assignment = client.post("/api/v1/writing/assignments", headers=teacher, json=payload).json()
    url = f"/api/v1/writing/assignments/{assignment['id']}"
    client.post(url + "/publish", headers=teacher)
    submission = client.post(url + "/submissions", headers=student).json()
    base = f"/api/v1/writing/submissions/{submission['id']}"
    client.patch(base + "/draft", headers=student, json={"content": "My cached essay."})
    updated = client.put(url, headers=teacher, json={**payload, "title": "Revised instructions"})
    assert updated.status_code == 200, updated.text
    assert client.get(base, headers=student).json()["draft_content"] == "My cached essay."
    client.post(url + "/close", headers=teacher)
    assert client.patch(base + "/draft", headers=student, json={"content": "No"}).status_code == 409
    client.post(url + "/publish", headers=teacher)
    body = {"content": "My cached essay.", "client_submit_id": "stable-request-id"}
    assert client.post(base + "/submit", headers=student, json=body).json()["status"] == "finalized"
    repeated = client.post(base + "/submit", headers=student, json=body)
    assert repeated.status_code == 200
    assert len(repeated.json()["revisions"]) == 1
    assert client.put(url, headers=teacher, json={**payload, "revision_limit": 2}).status_code == 409


def test_teacher_cannot_edit_or_append_another_teachers_data(client, course, db_session):
    db_session.add(User(student_no="T_OTHER", name="Other teacher", password_hash=hash_password("password123"), email="other-teacher@example.test", email_verified=True, role=UserRole.TEACHER))
    db_session.commit()
    other = login_header(client, "T_OTHER")
    assert client.put(f"/api/v1/tasks/{course['task']['id']}", headers=other, json=oral_payload(course["task"])).status_code == 404
    assert client.post(f"/api/v1/topic-banks/{course['bank']['id']}/topics/batch", headers=other, json={"topics": [{"prompt": "Forbidden"}]}).status_code == 403
    payload = writing_payload(course)
    assignment = client.post("/api/v1/writing/assignments", headers=course["teacher"], json=payload).json()
    assert client.put(f"/api/v1/writing/assignments/{assignment['id']}", headers=other, json=payload).status_code == 404
