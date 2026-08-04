from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.entities import User, UserRole

# The host image ships legacy Starlette with httpx 0.28. Project dependencies use
# a compatible FastAPI/Starlette pair, but this keeps local host tests runnable too.
if "app" not in httpx.Client.__init__.__code__.co_varnames:
    original_httpx_init = httpx.Client.__init__

    def compatible_httpx_init(self, *args, app=None, **kwargs):
        original_httpx_init(self, *args, **kwargs)

    httpx.Client.__init__ = compatible_httpx_init


@pytest.fixture()
def db_session(tmp_path) -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    previous_storage_backend = settings.storage_backend
    settings.storage_backend = "local"
    settings.upload_dir = str(tmp_path / "uploads")
    try:
        yield db
    finally:
        settings.storage_backend = previous_storage_backend
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_header(client: TestClient, student_no: str, name: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"student_no": student_no, "name": name, "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def login_header(client: TestClient, student_no: str, password: str = "password123") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"student_no": student_no, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def admin(client: TestClient, db_session: Session) -> dict[str, str]:
    db_session.add(
        User(
            student_no="A9001",
            name="Admin",
            password_hash=hash_password("password123"),
            role=UserRole.ADMIN,
        )
    )
    db_session.commit()
    return login_header(client, "A9001")


@pytest.fixture()
def course(client: TestClient, admin):
    teacher_account = client.post(
        "/api/v1/admin/users",
        headers=admin,
        json={"student_no": "T9001", "name": "Teacher", "password": "password123", "role": "teacher"},
    )
    assert teacher_account.status_code == 201, teacher_account.text
    teacher = login_header(client, "T9001")
    student = auth_header(client, "900001", "Student")
    other_student = auth_header(client, "900002", "Other")

    classroom = client.post("/api/v1/classes", headers=teacher, json={"name": "Test Class"}).json()
    assert client.post(
        "/api/v1/classes/join", headers=student, json={"invite_code": classroom["invite_code"]}
    ).status_code == 200

    bank = client.post(
        "/api/v1/topic-banks",
        headers=teacher,
        json={"name": "Test Bank", "description": "Core test topics"},
    ).json()
    for index in range(3):
        response = client.post(
            f"/api/v1/topic-banks/{bank['id']}/topics",
            headers=teacher,
            json={
                "prompt": f"Explain test speaking topic number {index}.",
                "category": "Test",
                "difficulty": "medium",
                "tags": "test",
            },
        )
        assert response.status_code == 201

    now = datetime.now(timezone.utc)
    task = client.post(
        "/api/v1/tasks",
        headers=teacher,
        json={
            "name": "Core flow",
            "description": "Test the complete flow",
            "class_id": classroom["id"],
            "topic_bank_id": bank["id"],
            "research_seconds": 10,
            "preparation_seconds": 10,
            "speaking_seconds": 10,
            "starts_at": (now - timedelta(minutes=1)).isoformat(),
            "due_at": (now + timedelta(days=1)).isoformat(),
            "redraw_limit": 1,
            "rerecord_limit": 1,
            "notes_required": True,
            "allow_early_finish": False,
        },
    )
    assert task.status_code == 201, task.text
    task_data = task.json()
    published = client.post(f"/api/v1/tasks/{task_data['id']}/publish", headers=teacher)
    assert published.status_code == 200
    return {
        "teacher": teacher,
        "admin": admin,
        "student": student,
        "other_student": other_student,
        "classroom": classroom,
        "bank": bank,
        "task": published.json(),
    }


@pytest.fixture()
def session(client: TestClient, course):
    response = client.post(
        f"/api/v1/tasks/{course['task']['id']}/sessions", headers=course["student"]
    )
    assert response.status_code == 200, response.text
    return response.json()
