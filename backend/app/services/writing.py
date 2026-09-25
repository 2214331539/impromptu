import re
from datetime import datetime, timezone

from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError
from app.db.base import utc_now
from app.models.entities import (
    ClassRoom,
    User,
    UserRole,
    WritingAssignment,
    WritingAssignmentStatus,
    WritingGrammarHintMode,
    WritingGrammarIssue,
    WritingGrammarStatus,
    WritingRevision,
    WritingSubmission,
    WritingSubmissionStatus,
)
from app.repositories.repositories import ClassRepository, WritingRepository
from app.schemas.models import (
    WritingAssignmentCreate,
    WritingAssignmentOut,
    WritingDraftUpdate,
    WritingGrammarIssueOut,
    WritingIntegrityEventOut,
    WritingIntegrityRequest,
    WritingPresenceEnterRequest,
    WritingPresenceHeartbeatRequest,
    WritingPresenceLeaveRequest,
    WritingPresenceVisitOut,
    WritingRevisionOut,
    WritingSubmissionOut,
    WritingSubmitRequest,
    WritingTeacherSubmissionDetail,
    WritingTeacherSubmissionSummary,
)
from app.services.writing_grammar import WritingGrammarService
from app.services.writing_presence import WritingPresenceService


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_cjk(char: str) -> bool:
    return "\u4e00" <= char <= "\u9fff"


def count_words(content: str) -> int:
    cjk_count = sum(_is_cjk(char) for char in content)
    non_cjk_chars = "".join(" " if _is_cjk(char) else char for char in content)
    words = [word for word in re.findall(r"[A-Za-z0-9_]+(?:['’-][A-Za-z0-9_]+)*", non_cjk_chars)]
    return cjk_count + len(words)


class WritingService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = WritingRepository(db)
        self.classes = ClassRepository(db)
        self.grammar = WritingGrammarService()
        self.presence = WritingPresenceService(db)

    def list_for(self, user: User) -> list[WritingAssignmentOut]:
        assignments = (
            self.repository.assignments_for_teacher(user.id)
            if user.role == UserRole.TEACHER
            else self.repository.assignments_for_student(user.id)
        )
        if user.role == UserRole.STUDENT:
            assignments = [
                item
                for item in assignments
                if item.status != WritingAssignmentStatus.DRAFT
            ]
        return [self._assignment_out(item, user.id) for item in assignments]

    def get_assignment_for(self, user: User, assignment_id: int) -> WritingAssignmentOut:
        assignment = self._accessible_assignment(user, assignment_id)
        return self._assignment_out(assignment, user.id)

    def create_assignment(
        self, teacher: User, data: WritingAssignmentCreate
    ) -> WritingAssignmentOut:
        classroom = self.classes.get(data.class_id)
        if not classroom or classroom.teacher_id != teacher.id:
            raise AppError("WRITING_CLASS_NOT_FOUND", "目标班级不存在或无权访问", 404)
        if (
            data.grammar_hint_mode == WritingGrammarHintMode.AFTER_SUBMIT
            and not settings.ai_import_configured
        ):
            raise AppError("WRITING_GRAMMAR_NOT_CONFIGURED", "语法检测未配置，无法启用该策略", 503)
        assignment = WritingAssignment(teacher_id=teacher.id, **data.model_dump())
        self.db.add(assignment)
        self.db.commit()
        return self._assignment_out(self.repository.assignment(assignment.id), teacher.id)

    def update_assignment(self, teacher: User, assignment_id: int, data: WritingAssignmentCreate) -> WritingAssignmentOut:
        assignment = self.repository.assignment(assignment_id)
        if not assignment or assignment.teacher_id != teacher.id:
            raise AppError("WRITING_ASSIGNMENT_NOT_FOUND", "写作任务不存在或无权编辑", 404)
        classroom = self.classes.get(data.class_id)
        if not classroom or classroom.teacher_id != teacher.id:
            raise AppError("WRITING_CLASS_NOT_FOUND", "目标班级不存在或无权访问", 404)
        if assignment.submissions and data.class_id != assignment.class_id:
            raise AppError("WRITING_ALREADY_STARTED", "已有学生开始写作，不能更换班级", 409)
        if any(s.revisions for s in assignment.submissions) and (
            data.grammar_hint_mode != assignment.grammar_hint_mode or data.revision_limit != assignment.revision_limit
        ):
            raise AppError("WRITING_RULES_LOCKED", "已有正式提交，不能更改检测策略或修改次数", 409)
        if data.grammar_hint_mode == WritingGrammarHintMode.AFTER_SUBMIT and not settings.ai_import_configured:
            raise AppError("WRITING_GRAMMAR_NOT_CONFIGURED", "语法检测未配置", 503)
        for key, value in data.model_dump().items():
            setattr(assignment, key, value)
        self.db.commit()
        self.db.expire_all()
        return self._assignment_out(self.repository.assignment(assignment_id), teacher.id)

    def set_status(
        self, teacher: User, assignment_id: int, status: WritingAssignmentStatus
    ) -> WritingAssignmentOut:
        assignment = self.repository.assignment(assignment_id)
        if not assignment or assignment.teacher_id != teacher.id:
            raise AppError("WRITING_ASSIGNMENT_NOT_FOUND", "写作任务不存在或无权访问", 404)
        if status == WritingAssignmentStatus.DRAFT:
            raise AppError("WRITING_ASSIGNMENT_INVALID_STATUS", "不能恢复为草稿", 400)
        if status == WritingAssignmentStatus.PUBLISHED and assignment.status == status:
            raise AppError("WRITING_ASSIGNMENT_ALREADY_PUBLISHED", "任务已发布", 409)
        if status == WritingAssignmentStatus.CLOSED and assignment.status == status:
            raise AppError("WRITING_ASSIGNMENT_NOT_PUBLISHED", "任务已关闭", 409)
        assignment.status = status
        self.db.commit()
        return self._assignment_out(self.repository.assignment(assignment_id), teacher.id)

    def create_or_get_submission(
        self, student: User, assignment_id: int
    ) -> WritingSubmissionOut:
        assignment = self.repository.assignment(assignment_id)
        if not assignment or assignment.status != WritingAssignmentStatus.PUBLISHED:
            raise AppError("WRITING_ASSIGNMENT_NOT_FOUND", "写作任务未发布或不存在", 404)
        if not self.classes.is_member(assignment.class_id, student.id):
            raise AppError("FORBIDDEN", "你不在该任务班级中", 403)
        existing = self.repository.submission_for_assignment_student(assignment_id, student.id)
        if existing:
            self.presence.reconcile(existing.id)
            return self._submission_out(self.repository.submission(existing.id))
        self._ensure_can_edit(assignment)
        submission = WritingSubmission(assignment_id=assignment_id, student_id=student.id)
        self.db.add(submission)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            submission = self.repository.submission_for_assignment_student(assignment_id, student.id)
        return self._submission_out(self.repository.submission(submission.id))

    def get_submission_for(self, user: User, submission_id: int) -> WritingSubmissionOut:
        submission = self._accessible_submission(user, submission_id)
        self.presence.reconcile(submission.id)
        return self._submission_out(self.repository.submission(submission_id))

    def save_draft(
        self, student: User, submission_id: int, data: WritingDraftUpdate
    ) -> WritingSubmissionOut:
        submission = self._student_submission(student.id, submission_id, lock=True)
        if submission.status == WritingSubmissionStatus.FINALIZED:
            raise AppError("WRITING_SUBMISSION_FINALIZED", "写作已锁定，不能继续编辑", 409)
        self._ensure_can_edit(submission.assignment)
        submission.draft_content = data.content
        submission.draft_word_count = count_words(data.content)
        submission.draft_updated_at = utc_now()
        self.db.commit()
        return self._submission_out(self.repository.submission(submission_id))

    def submit(
        self, student: User, submission_id: int, data: WritingSubmitRequest
    ) -> WritingSubmissionOut:
        submission = self._student_submission(student.id, submission_id, lock=True)
        existing = self.repository.revision_by_client_submit(
            submission_id, data.client_submit_id
        )
        if existing:
            return self._submission_out(self.repository.submission(submission_id))
        if submission.status == WritingSubmissionStatus.FINALIZED:
            raise AppError("WRITING_SUBMISSION_FINALIZED", "写作已锁定，不能继续提交", 409)
        self._ensure_can_edit(submission.assignment)
        self._validate_content(submission.assignment, data.content)

        if submission.status == WritingSubmissionStatus.DRAFTING:
            new_number = 0
            first_submit = True
        else:
            existing_count = len(submission.revisions)
            additional_used = existing_count - 1
            if additional_used >= submission.assignment.revision_limit:
                raise AppError("WRITING_REVISION_LIMIT_REACHED", "修改次数已用完", 409)
            new_number = existing_count
            first_submit = False

        now = utc_now()
        revision = WritingRevision(
            submission_id=submission.id,
            revision_number=new_number,
            client_submit_id=data.client_submit_id,
            content=data.content,
            word_count=count_words(data.content),
            grammar_status=WritingGrammarStatus.NOT_APPLICABLE
            if submission.assignment.grammar_hint_mode == WritingGrammarHintMode.OFF
            else WritingGrammarStatus.PENDING,
            submitted_at=now,
        )
        self.db.add(revision)
        self.db.flush()

        submission.draft_content = data.content
        submission.draft_word_count = count_words(data.content)
        submission.draft_updated_at = now
        submission.latest_revision_id = revision.id
        if first_submit:
            submission.first_submitted_at = now
        after_count = len(submission.revisions) + 1
        additional_used_after = after_count - 1
        if first_submit and submission.assignment.revision_limit == 0:
            submission.status = WritingSubmissionStatus.FINALIZED
        elif additional_used_after >= submission.assignment.revision_limit:
            submission.status = WritingSubmissionStatus.FINALIZED
        else:
            submission.status = WritingSubmissionStatus.REVISING
        if submission.status == WritingSubmissionStatus.FINALIZED:
            submission.final_submitted_at = now
        self.db.commit()

        if submission.assignment.grammar_hint_mode == WritingGrammarHintMode.AFTER_SUBMIT:
            self._detect_for_revision(revision.id)

        self.db.expire(submission, ["revisions"])
        return self._submission_out(self.repository.submission(submission_id))

    def retry_grammar(self, student: User, submission_id: int) -> WritingSubmissionOut:
        submission = self._student_submission(student.id, submission_id)
        if submission.assignment.grammar_hint_mode != WritingGrammarHintMode.AFTER_SUBMIT:
            raise AppError("WRITING_GRAMMAR_NOT_ENABLED", "该任务未启用语法检测", 409)
        latest = self.repository.submission(submission_id).revisions[-1] if submission.revisions else None
        if not latest:
            raise AppError("WRITING_REVISION_NOT_FOUND", "暂无可检测的写作版本", 404)
        self._detect_for_revision(latest.id)
        self.db.expire(submission, ["revisions"])
        return self._submission_out(self.repository.submission(submission_id))

    def teacher_submissions(
        self, teacher: User, assignment_id: int
    ) -> list[WritingTeacherSubmissionSummary]:
        assignment = self.repository.assignment(assignment_id)
        if not assignment or assignment.teacher_id != teacher.id:
            raise AppError("WRITING_ASSIGNMENT_NOT_FOUND", "写作任务不存在或无权访问", 404)
        submissions = self.repository.submissions_for_assignment(assignment_id)
        result = []
        for submission in submissions:
            latest = submission.revisions[-1] if submission.revisions else None
            summary = self.presence.summary(submission.id)
            result.append(
                WritingTeacherSubmissionSummary(
                    submission_id=submission.id,
                    student_id=submission.student_id,
                    student_no=submission.student.student_no,
                    student_name=submission.student.name,
                    status=submission.status,
                    draft_word_count=submission.draft_word_count,
                    latest_revision_number=latest.revision_number if latest else None,
                    latest_grammar_issue_count=latest.grammar_issue_count if latest else 0,
                    first_submitted_at=submission.first_submitted_at,
                    final_submitted_at=submission.final_submitted_at,
                    total_stay_seconds=summary["total_stay_seconds"],
                    total_leave_seconds=summary["total_leave_seconds"],
                    leave_count=summary["leave_count"],
                    violation_count=len(submission.integrity_events),
                )
            )
        return result

    def teacher_submission_detail(
        self, teacher: User, submission_id: int
    ) -> WritingTeacherSubmissionDetail:
        submission = self.repository.submission(submission_id)
        if not submission or submission.assignment.teacher_id != teacher.id:
            raise AppError("WRITING_SUBMISSION_NOT_FOUND", "写作提交不存在或无权访问", 404)
        self.presence.reconcile(submission_id)
        submission = self.repository.submission(submission_id)
        summary = self.presence.summary(submission_id)
        return WritingTeacherSubmissionDetail(
            submission_id=submission.id,
            assignment_id=submission.assignment.id,
            assignment_title=submission.assignment.title,
            grammar_hint_mode=submission.assignment.grammar_hint_mode,
            revision_limit=submission.assignment.revision_limit,
            student_id=submission.student_id,
            student_no=submission.student.student_no,
            student_name=submission.student.name,
            status=submission.status,
            draft_content=submission.draft_content,
            draft_word_count=submission.draft_word_count,
            first_submitted_at=submission.first_submitted_at,
            final_submitted_at=submission.final_submitted_at,
            revisions=[self._revision_out(item) for item in submission.revisions],
            visits=[
                WritingPresenceVisitOut(
                    id=item.id,
                    client_visit_id=item.client_visit_id,
                    started_at=item.started_at,
                    ended_at=item.ended_at,
                    last_heartbeat_at=item.last_heartbeat_at,
                    end_reason=item.end_reason,
                )
                for item in submission.visits
            ],
            integrity_events=[
                WritingIntegrityEventOut(
                    id=item.id,
                    event_type=item.event_type,
                    source=item.source,
                    detail=item.detail,
                    occurred_at=item.occurred_at,
                )
                for item in submission.integrity_events
            ],
            total_stay_seconds=summary["total_stay_seconds"],
            total_leave_seconds=summary["total_leave_seconds"],
            leave_count=summary["leave_count"],
        )

    def presence_enter(
        self, student: User, submission_id: int, data: WritingPresenceEnterRequest
    ) -> None:
        self._student_submission(student.id, submission_id)
        self.presence.enter(submission_id, student.id, data.client_visit_id)

    def presence_heartbeat(
        self, student: User, submission_id: int, data: WritingPresenceHeartbeatRequest
    ) -> None:
        self._student_submission(student.id, submission_id)
        self.presence.heartbeat(submission_id, data.client_visit_id)

    def presence_leave(
        self, student: User, submission_id: int, data: WritingPresenceLeaveRequest
    ) -> None:
        self._student_submission(student.id, submission_id)
        self.presence.leave(submission_id, data.client_visit_id, data.reason)

    def integrity_event(
        self, student: User, submission_id: int, data: WritingIntegrityRequest
    ) -> None:
        self._student_submission(student.id, submission_id)
        from app.models.entities import WritingIntegrityEvent

        self.db.add(
            WritingIntegrityEvent(
                submission_id=submission_id,
                student_id=student.id,
                event_type=data.event_type,
                source=data.source,
                detail=data.detail,
            )
        )
        self.db.commit()

    def _detect_for_revision(self, revision_id: int) -> None:
        revision = self.db.get(WritingRevision, revision_id)
        if not revision:
            return
        try:
            issues = self.grammar.detect(revision.content)
        except AppError:
            revision.grammar_status = WritingGrammarStatus.FAILED
            revision.grammar_issue_count = 0
            self.db.execute(
                delete(WritingGrammarIssue).where(
                    WritingGrammarIssue.revision_id == revision.id
                )
            )
            self.db.commit()
            return
        self.db.execute(
            delete(WritingGrammarIssue).where(
                WritingGrammarIssue.revision_id == revision.id
            )
        )
        for issue in issues:
            self.db.add(
                WritingGrammarIssue(
                    revision_id=revision.id,
                    start_offset=issue.start_offset,
                    end_offset=issue.end_offset,
                    segment_id=issue.segment_id,
                    category=issue.category,
                    message=issue.message,
                )
            )
        revision.grammar_status = WritingGrammarStatus.COMPLETED
        revision.grammar_issue_count = len(issues)
        self.db.commit()

    def _student_submission(
        self, student_id: int, submission_id: int, lock: bool = False
    ) -> WritingSubmission:
        submission = self.repository.submission(submission_id, for_update=lock)
        if not submission or submission.student_id != student_id:
            raise AppError("WRITING_SUBMISSION_NOT_FOUND", "写作提交不存在", 404)
        return submission

    def _accessible_submission(self, user: User, submission_id: int) -> WritingSubmission:
        submission = self.repository.submission(submission_id)
        if not submission:
            raise AppError("WRITING_SUBMISSION_NOT_FOUND", "写作提交不存在", 404)
        allowed = submission.student_id == user.id or submission.assignment.teacher_id == user.id
        if not allowed:
            raise AppError("FORBIDDEN", "无权访问该写作提交", 403)
        return submission

    def _accessible_assignment(self, user: User, assignment_id: int) -> WritingAssignment:
        assignment = self.repository.assignment(assignment_id)
        if not assignment:
            raise AppError("WRITING_ASSIGNMENT_NOT_FOUND", "写作任务不存在", 404)
        if user.role == UserRole.TEACHER and assignment.teacher_id != user.id:
            raise AppError("FORBIDDEN", "无权访问该写作任务", 403)
        if user.role == UserRole.STUDENT:
            if not self.classes.is_member(assignment.class_id, user.id):
                raise AppError("FORBIDDEN", "你不在该任务班级中", 403)
            if assignment.status == WritingAssignmentStatus.DRAFT:
                raise AppError("WRITING_ASSIGNMENT_NOT_FOUND", "写作任务尚未发布", 404)
        return assignment

    def _ensure_can_edit(self, assignment: WritingAssignment) -> None:
        now = utc_now()
        if assignment.status != WritingAssignmentStatus.PUBLISHED:
            raise AppError("WRITING_ASSIGNMENT_CLOSED", "写作任务已关闭", 409)
        if now < aware(assignment.starts_at):
            raise AppError("WRITING_ASSIGNMENT_NOT_STARTED", "写作任务尚未开始", 400)
        if now > aware(assignment.due_at) and not assignment.allow_late_submission:
            raise AppError("WRITING_ASSIGNMENT_CLOSED", "写作任务已截止", 409)

    def _validate_content(self, assignment: WritingAssignment, content: str) -> None:
        count = count_words(content)
        if count < assignment.min_words:
            raise AppError("WRITING_CONTENT_TOO_SHORT", "内容字数不足", 400)
        if assignment.max_words is not None and count > assignment.max_words:
            raise AppError("WRITING_CONTENT_TOO_LONG", "内容字数超过上限", 400)
        if len(content) > settings.writing_grammar_max_chars and assignment.grammar_hint_mode == WritingGrammarHintMode.AFTER_SUBMIT:
            raise AppError("WRITING_CONTENT_TOO_LONG", "内容过长，无法进行语法检测", 400)

    def _assignment_out(
        self, assignment: WritingAssignment, current_user_id: int | None = None
    ) -> WritingAssignmentOut:
        participant_count = len(assignment.classroom.members) if assignment.classroom.members else 0
        submitted_count = sum(
            item.status != WritingSubmissionStatus.DRAFTING for item in assignment.submissions
        )
        finalized_count = sum(
            item.status == WritingSubmissionStatus.FINALIZED for item in assignment.submissions
        )
        my_submission = next(
            (item for item in assignment.submissions if item.student_id == current_user_id),
            None,
        )
        return WritingAssignmentOut(
            id=assignment.id,
            title=assignment.title,
            instructions=assignment.instructions,
            class_id=assignment.class_id,
            class_name=assignment.classroom.name,
            teacher_id=assignment.teacher_id,
            teacher_name=assignment.teacher.name,
            status=assignment.status,
            starts_at=assignment.starts_at,
            due_at=assignment.due_at,
            min_words=assignment.min_words,
            max_words=assignment.max_words,
            grammar_hint_mode=assignment.grammar_hint_mode,
            revision_limit=assignment.revision_limit,
            allow_late_submission=assignment.allow_late_submission,
            participant_count=participant_count,
            submitted_count=submitted_count,
            finalized_count=finalized_count,
            my_submission_id=my_submission.id if my_submission else None,
            my_submission_status=my_submission.status if my_submission else None,
        )

    def _submission_out(self, submission: WritingSubmission | None) -> WritingSubmissionOut:
        if not submission:
            raise AppError("WRITING_SUBMISSION_NOT_FOUND", "写作提交不存在", 404)
        revisions = sorted(submission.revisions, key=lambda item: item.revision_number)
        if revisions:
            additional_used = len(revisions) - 1
            remaining = max(0, submission.assignment.revision_limit - additional_used)
        else:
            remaining = submission.assignment.revision_limit
        return WritingSubmissionOut(
            id=submission.id,
            assignment_id=submission.assignment_id,
            student_id=submission.student_id,
            status=submission.status,
            draft_content=submission.draft_content,
            draft_word_count=submission.draft_word_count,
            draft_updated_at=submission.draft_updated_at,
            first_submitted_at=submission.first_submitted_at,
            final_submitted_at=submission.final_submitted_at,
            revisions=[self._revision_out(item) for item in revisions],
            remaining_revisions=remaining,
            server_time=utc_now(),
        )

    @staticmethod
    def _revision_out(revision: WritingRevision) -> WritingRevisionOut:
        return WritingRevisionOut(
            id=revision.id,
            revision_number=revision.revision_number,
            content=revision.content,
            word_count=revision.word_count,
            grammar_status=revision.grammar_status,
            grammar_issue_count=revision.grammar_issue_count,
            submitted_at=revision.submitted_at,
            issues=[
                WritingGrammarIssueOut(
                    id=item.id,
                    start_offset=item.start_offset,
                    end_offset=item.end_offset,
                    segment_id=item.segment_id,
                    category=item.category,
                    message=item.message,
                )
                for item in sorted(revision.issues, key=lambda x: (x.start_offset, x.end_offset))
            ],
        )
