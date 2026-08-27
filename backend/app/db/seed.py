import math
import struct
import wave
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import utc_now
from app.db.session import SessionLocal
from app.models.entities import (
    ClassMember,
    ClassRoom,
    Difficulty,
    Evaluation,
    Recording,
    SessionPhase,
    TaskStatus,
    Topic,
    TopicBank,
    TopicDrawRecord,
    TrainingNote,
    TrainingSession,
    TrainingTask,
    User,
    UserRole,
)

TOPICS = [
    ("Describe a small decision that changed your daily routine.", "Daily life", Difficulty.EASY, "routine,decision"),
    ("Should schools limit students' use of artificial intelligence?", "Education", Difficulty.HARD, "school,technology"),
    ("Talk about a person who taught you something outside the classroom.", "People", Difficulty.EASY, "mentor,experience"),
    ("Is it better to study alone or with a group? Explain your view.", "Education", Difficulty.MEDIUM, "study,opinion"),
    ("Describe a place in your city that visitors often overlook.", "Places", Difficulty.MEDIUM, "city,culture"),
    ("What makes an online community healthy and useful?", "Technology", Difficulty.HARD, "internet,community"),
    ("Talk about a skill you want to learn in the next year.", "Growth", Difficulty.EASY, "goals,learning"),
    ("Should public transportation be free in large cities?", "Society", Difficulty.HARD, "transport,policy"),
    ("Describe a book, film, or podcast that changed your perspective.", "Culture", Difficulty.MEDIUM, "media,ideas"),
    ("What is one tradition worth preserving in modern life?", "Culture", Difficulty.MEDIUM, "tradition,society"),
    ("Explain how you recover after making a mistake.", "Growth", Difficulty.EASY, "reflection,resilience"),
    ("Does competition help students learn more effectively?", "Education", Difficulty.HARD, "competition,learning"),
    ("Describe an environmental change you have noticed locally.", "Environment", Difficulty.MEDIUM, "nature,change"),
    ("What should people consider before sharing news online?", "Technology", Difficulty.MEDIUM, "media,critical-thinking"),
    ("Talk about a memorable conversation with someone older than you.", "People", Difficulty.EASY, "conversation,memory"),
]


def create_demo_wav(path: Path, seconds: float = 2.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rate = 8000
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        frames = bytearray()
        for i in range(int(rate * seconds)):
            value = int(500 * math.sin(2 * math.pi * 220 * i / rate))
            frames.extend(struct.pack("<h", value))
        output.writeframes(bytes(frames))


def seed() -> None:
    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.student_no == "A1001"))
        if not admin:
            db.add(
                User(
                    student_no="A1001",
                    email="admin@impromptu.local",
                    email_verified=True,
                    name="系统管理员",
                    password_hash=hash_password("admin123"),
                    role=UserRole.ADMIN,
                )
            )
            db.commit()

        if db.scalar(select(User.id).where(User.student_no == "T1001")):
            print("Seed data already exists; skipping.")
            return

        teacher = User(
            student_no="T1001",
            email="teacher@impromptu.local",
            email_verified=True,
            name="林老师",
            password_hash=hash_password("teacher123"),
            role=UserRole.TEACHER,
        )
        student_a = User(
            student_no="250001",
            email="student1@impromptu.local",
            email_verified=True,
            name="陈语桐",
            password_hash=hash_password("student123"),
            role=UserRole.STUDENT,
        )
        student_b = User(
            student_no="250002",
            email="student2@impromptu.local",
            email_verified=True,
            name="周明远",
            password_hash=hash_password("student123"),
            role=UserRole.STUDENT,
        )
        db.add_all([teacher, student_a, student_b])
        db.flush()

        classroom = ClassRoom(name="高二英语口语 A 班", teacher_id=teacher.id, invite_code="SPEAK6")
        db.add(classroom)
        db.flush()
        db.add_all(
            [
                ClassMember(class_id=classroom.id, student_id=student_a.id),
                ClassMember(class_id=classroom.id, student_id=student_b.id),
            ]
        )

        bank = TopicBank(
            name="Everyday English Speaking",
            description="围绕校园、成长、社会与科技的即兴口语题库。",
            teacher_id=teacher.id,
        )
        db.add(bank)
        db.flush()
        topic_models = [
            Topic(bank_id=bank.id, prompt=p, category=c, difficulty=d, tags=t)
            for p, c, d, t in TOPICS
        ]
        db.add_all(topic_models)
        db.flush()

        now = utc_now()
        task = TrainingTask(
            name="Week 3 · Impromptu Speaking",
            description="完成一次英文即兴表达。先整理观点，再用清晰的开头、论据和结尾完成演讲。",
            teacher_id=teacher.id,
            class_id=classroom.id,
            topic_bank_id=bank.id,
            research_seconds=900,
            preparation_seconds=60,
            speaking_seconds=180,
            starts_at=now - timedelta(days=1),
            due_at=now + timedelta(days=7),
            redraw_limit=1,
            rerecord_limit=1,
            notes_required=True,
            allow_early_finish=False,
            status=TaskStatus.PUBLISHED,
        )
        db.add(task)
        db.flush()

        session = TrainingSession(
            task_id=task.id,
            student_id=student_b.id,
            final_topic_id=topic_models[3].id,
            phase=SessionPhase.SUBMITTED,
            research_started_at=now - timedelta(hours=2, minutes=20),
            research_ends_at=now - timedelta(hours=2, minutes=5),
            preparation_started_at=now - timedelta(hours=2, minutes=5),
            preparation_ends_at=now - timedelta(hours=2, minutes=3),
            speaking_started_at=now - timedelta(hours=2, minutes=3),
            speaking_ends_at=now - timedelta(hours=2),
            speaking_finished_at=now - timedelta(hours=2, seconds=12),
            recording_attempts_started=1,
            submitted_at=now - timedelta(hours=1, minutes=58),
            self_assessment="I organized the answer clearly, but I paused too often in the second point.",
        )
        db.add(session)
        db.flush()
        db.add_all(
            [
                TopicDrawRecord(
                    session_id=session.id,
                    topic_id=topic_models[3].id,
                    draw_number=1,
                    confirmed=True,
                ),
                TrainingNote(
                    session_id=session.id,
                    content="Position: group study is useful for discussion.\n1. Different perspectives\n2. Accountability\nMention quiet individual review.",
                    locked=True,
                ),
            ]
        )
        audio_name = "demo-submission.wav"
        audio_path = Path(settings.upload_dir) / audio_name
        create_demo_wav(audio_path)
        db.add(
            Recording(
                session_id=session.id,
                file_path=audio_name,
                mime_type="audio/wav",
                size_bytes=audio_path.stat().st_size,
                duration_seconds=168,
                attempt_number=1,
                is_selected=True,
            )
        )
        db.add(
            Evaluation(
                session_id=session.id,
                teacher_id=teacher.id,
                content_accuracy=17,
                logical_structure=18,
                fluency=15,
                vocabulary=16,
                time_control=18,
                total_score=84,
                comment="结构完整，观点与例子衔接自然。下一次注意减少填充词，并让第二个论点更具体。",
                published_at=now - timedelta(hours=1),
            )
        )
        db.commit()
        print("Seed data created.")


if __name__ == "__main__":
    seed()
