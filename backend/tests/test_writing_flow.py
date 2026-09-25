from fastapi.testclient import TestClient

from app.core.config import settings
from app.services.writing_grammar import GrammarIssueDraft, WritingGrammarService


def enable_writing_ai(monkeypatch):
    monkeypatch.setattr(settings, "openai_model", "test-model")
    monkeypatch.setattr(settings, "openai_base_url", "https://example.test")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")


def create_writing_assignment(client: TestClient, course, monkeypatch, grammar="after_submit", revision_limit=1):
    enable_writing_ai(monkeypatch)
    response = client.post(
        "/api/v1/writing/assignments",
        headers=course["teacher"],
        json={
            "title": "Writing assignment",
            "instructions": "Write an essay.",
            "class_id": course["classroom"]["id"],
            "starts_at": "2026-09-17T00:00:00Z",
            "due_at": "2026-09-30T00:00:00Z",
            "min_words": 2,
            "max_words": None,
            "grammar_hint_mode": grammar,
            "revision_limit": revision_limit,
            "allow_late_submission": False,
        },
    )
    assert response.status_code == 201, response.text
    assignment = response.json()
    published = client.post(
        f"/api/v1/writing/assignments/{assignment['id']}/publish",
        headers=course["teacher"],
    )
    assert published.status_code == 200, published.text
    return published.json()


def start_writing(client: TestClient, course, assignment_id):
    response = client.post(
        f"/api/v1/writing/assignments/{assignment_id}/submissions",
        headers=course["student"],
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_writing_assignment_and_submission_permissions(client, course, monkeypatch):
    assignment = create_writing_assignment(client, course, monkeypatch)
    forbidden = client.get("/api/v1/writing/assignments", headers=course["other_student"])
    assert forbidden.status_code == 200
    assert not any(item["id"] == assignment["id"] for item in forbidden.json())

    submission = start_writing(client, course, assignment["id"])
    other = client.get(
        f"/api/v1/writing/submissions/{submission['id']}",
        headers=course["other_student"],
    )
    assert other.status_code == 403


def test_writing_draft_submit_revision_and_grammar(client, course, monkeypatch):
    assignment = create_writing_assignment(client, course, monkeypatch, revision_limit=1)
    submission = start_writing(client, course, assignment["id"])

    saved = client.patch(
        f"/api/v1/writing/submissions/{submission['id']}/draft",
        headers=course["student"],
        json={"content": "She go to school."},
    )
    assert saved.status_code == 200, saved.text

    def fake_detect(self, content):
        return [
            GrammarIssueDraft(
                start_offset=4,
                end_offset=6,
                segment_id="p0-s0",
                category="subject_verb_agreement",
                message="此处可能存在主谓一致问题",
            )
        ]

    monkeypatch.setattr(WritingGrammarService, "detect", fake_detect)
    submitted = client.post(
        f"/api/v1/writing/submissions/{submission['id']}/submit",
        headers=course["student"],
        json={"content": "She go to school.", "client_submit_id": "submit-one-0001"},
    )
    assert submitted.status_code == 200, submitted.text
    body = submitted.json()
    assert body["status"] == "revising"
    assert body["revisions"][0]["revision_number"] == 0
    assert body["revisions"][0]["grammar_status"] == "completed"
    assert body["revisions"][0]["issues"][0]["message"] == "此处可能存在主谓一致问题"

    revised = client.post(
        f"/api/v1/writing/submissions/{submission['id']}/submit",
        headers=course["student"],
        json={"content": "She goes to school.", "client_submit_id": "submit-two-0002"},
    )
    assert revised.status_code == 200, revised.text
    assert revised.json()["status"] == "finalized"
    assert revised.json()["remaining_revisions"] == 0
    assert len(revised.json()["revisions"]) == 2

    locked = client.post(
        f"/api/v1/writing/submissions/{submission['id']}/submit",
        headers=course["student"],
        json={"content": "She goes to school.", "client_submit_id": "submit-three-0003"},
    )
    assert locked.status_code == 409


def test_writing_grammar_off_does_not_create_issues(client, course, monkeypatch):
    assignment = create_writing_assignment(client, course, monkeypatch, grammar="off")
    submission = start_writing(client, course, assignment["id"])
    submitted = client.post(
        f"/api/v1/writing/submissions/{submission['id']}/submit",
        headers=course["student"],
        json={"content": "This is a complete sentence.", "client_submit_id": "submit-off-0001"},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["revisions"][0]["grammar_status"] == "not_applicable"
    assert submitted.json()["revisions"][0]["issues"] == []


def test_writing_presence_and_teacher_summary(client, course, monkeypatch):
    assignment = create_writing_assignment(client, course, monkeypatch)
    submission = start_writing(client, course, assignment["id"])
    base = f"/api/v1/writing/submissions/{submission['id']}"

    entered = client.post(
        f"{base}/presence/enter",
        headers=course["student"],
        json={"client_visit_id": "visit-000001"},
    )
    assert entered.status_code == 204
    heartbeat = client.post(
        f"{base}/presence/heartbeat",
        headers=course["student"],
        json={"client_visit_id": "visit-000001"},
    )
    assert heartbeat.status_code == 204
    left = client.post(
        f"{base}/presence/leave",
        headers=course["student"],
        json={"client_visit_id": "visit-000001", "reason": "leave"},
    )
    assert left.status_code == 204

    summary = client.get(
        f"/api/v1/writing/assignments/{assignment['id']}/submissions",
        headers=course["teacher"],
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()[0]["submission_id"] == submission["id"]
    assert summary.json()[0]["total_stay_seconds"] >= 0
