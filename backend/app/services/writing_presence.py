from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import utc_now
from app.models.entities import WritingPresenceVisit
from app.repositories.repositories import WritingRepository


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class WritingPresenceService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = WritingRepository(db)

    def enter(self, submission_id: int, student_id: int, client_visit_id: str) -> None:
        now = utc_now()
        for visit in self.repository.open_visits(submission_id):
            visit.ended_at = now
            visit.end_reason = "new_visit"
        self.db.add(
            WritingPresenceVisit(
                submission_id=submission_id,
                student_id=student_id,
                client_visit_id=client_visit_id,
                started_at=now,
                last_heartbeat_at=now,
            )
        )
        self.db.commit()

    def heartbeat(self, submission_id: int, client_visit_id: str) -> None:
        visit = self.repository.open_visit(submission_id, client_visit_id)
        if not visit:
            return
        visit.last_heartbeat_at = utc_now()
        self.db.commit()

    def leave(self, submission_id: int, client_visit_id: str, reason: str) -> None:
        visit = self.repository.open_visit(submission_id, client_visit_id)
        if not visit:
            return
        visit.ended_at = utc_now()
        visit.end_reason = reason or "leave"
        self.db.commit()

    def reconcile(self, submission_id: int) -> None:
        now = utc_now()
        timeout = timedelta(seconds=settings.writing_presence_heartbeat_timeout_seconds)
        changed = False
        for visit in self.repository.open_visits(submission_id):
            last_heartbeat = _aware(visit.last_heartbeat_at)
            if last_heartbeat is None:
                continue
            if now - last_heartbeat >= timeout:
                visit.ended_at = last_heartbeat + timeout
                visit.end_reason = "idle_timeout"
                changed = True
        if changed:
            self.db.commit()

    def summary(self, submission_id: int) -> dict[str, float | int]:
        self.reconcile(submission_id)
        visits = self.repository.visits_for_submission(submission_id)
        now = utc_now()
        total_stay = 0.0
        total_leave = 0.0
        leave_count = 0
        previous_end: object = None
        for visit in visits:
            start = _aware(visit.started_at)
            end = _aware(visit.ended_at) or now
            if start is None:
                continue
            if end < start:
                end = start
            total_stay += (end - start).total_seconds()
            if previous_end is not None:
                gap = (start - previous_end).total_seconds()
                if gap > 0:
                    total_leave += gap
                    leave_count += 1
            previous_end = end
        if previous_end is not None and previous_end < now:
            total_leave += (now - previous_end).total_seconds()
        return {
            "total_stay_seconds": round(total_stay, 1),
            "total_leave_seconds": round(total_leave, 1),
            "leave_count": leave_count,
        }
