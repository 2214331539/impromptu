export type Role = "student" | "teacher" | "admin";
export type TaskStatus = "draft" | "published" | "closed";
export type SessionPhase = "mic_check" | "drawing" | "researching" | "preparing" | "speaking" | "review" | "submitted";
export type Difficulty = "easy" | "medium" | "hard";

export interface User { id: number; student_no: string; email: string | null; email_verified: boolean; name: string; role: Role }
export interface AuthResponse { access_token: string; token_type: "bearer"; user: User }
export interface AdminUser extends User { is_active: boolean; created_at: string }
export interface AdminOverview { metrics: Record<string, number>; recent_users: AdminUser[] }
export interface AdminClassRoom extends ClassRoom { teacher_id: number; teacher_name: string; created_at: string }
export interface ClassRoom { id: number; name: string; invite_code: string; is_active: boolean; student_count: number; task_count: number }
export interface Member { id: number; student_no: string; name: string; completed_count: number; average_score: number | null }
export interface TopicBank { id: number; name: string; description: string; is_active: boolean; topic_count: number; active_topic_count: number }
export interface Topic { id: number; bank_id: number; prompt: string; category: string; difficulty: Difficulty; tags: string; is_active: boolean; created_at: string }
export type TopicImportItem = Pick<Topic, "prompt" | "category" | "difficulty" | "tags">;
export interface TopicImportPreview { name: string; description: string; topics: TopicImportItem[]; warnings: string[] }
export interface TopicImportCommit { bank: TopicBank; topics: Topic[] }
export interface Task {
  id: number; name: string; description: string; class_id: number; class_name: string;
  topic_bank_id: number; topic_bank_name: string; teacher_id: number; teacher_name: string;
  research_seconds: number; preparation_seconds: number; speaking_seconds: number; starts_at: string; due_at: string;
  redraw_limit: number; rerecord_limit: number; notes_required: boolean; allow_early_finish: boolean;
  status: TaskStatus; participant_count: number; completed_count: number; completion_rate: number;
  my_session_id: number | null; my_phase: SessionPhase | null; my_return_pending: boolean;
}
export interface Draw { id: number; draw_number: number; confirmed: boolean; topic: Topic; redraws_remaining: number }
export interface Recording { id: number; url: string; download_url: string; stream_url: string; mime_type: string; size_bytes: number; duration_seconds: number; attempt_number: number; is_selected: boolean }
export interface Evaluation { id: number; content_accuracy: number; logical_structure: number; fluency: number; vocabulary: number; time_control: number; total_score: number; comment: string; published_at: string }
export interface TrainingSession {
  return_history: { reason: string; returned_at: string; teacher_id: number; submitted_at: string | null; recording_id: number | null; evaluation: Evaluation | null }[];
  id: number; task_id: number; student_id: number; student_name: string; student_no: string; phase: SessionPhase;
  final_topic: Topic | null; current_draw: Draw | null; draw_count: number; redraws_remaining: number;
  research_started_at: string | null; research_ends_at: string | null;
  preparation_started_at: string | null; preparation_ends_at: string | null; speaking_started_at: string | null;
  speaking_ends_at: string | null; speaking_finished_at: string | null; recording_attempts_started: number;
  rerecords_remaining: number; submitted_at: string | null; note: string; note_locked: boolean;
  self_assessment: string; recordings: Recording[]; evaluation: Evaluation | null; task: Task; server_time: string;
}
export interface Dashboard { metrics: Record<string, number>; pending_tasks: Task[]; recent_sessions: TrainingSession[] }
export interface ApiErrorBody { error?: { code: string; message: string }; detail?: string | Array<{ msg: string }> }

export type WritingAssignmentStatus = "draft" | "published" | "closed";
export type WritingGrammarHintMode = "off" | "after_submit";
export type WritingSubmissionStatus = "drafting" | "revising" | "finalized";
export type WritingGrammarStatus = "not_applicable" | "pending" | "completed" | "failed";

export interface WritingAssignment {
  id: number;
  title: string;
  instructions: string;
  class_id: number;
  class_name: string;
  teacher_id: number;
  teacher_name: string;
  status: WritingAssignmentStatus;
  starts_at: string;
  due_at: string;
  min_words: number;
  max_words: number | null;
  grammar_hint_mode: WritingGrammarHintMode;
  revision_limit: number;
  allow_late_submission: boolean;
  participant_count: number;
  submitted_count: number;
  finalized_count: number;
  my_submission_id: number | null;
  my_submission_status: WritingSubmissionStatus | null;
}

export interface WritingGrammarIssue {
  id: number;
  start_offset: number;
  end_offset: number;
  segment_id: string | null;
  category: string;
  message: string;
}

export interface WritingRevision {
  id: number;
  revision_number: number;
  content: string;
  word_count: number;
  grammar_status: WritingGrammarStatus;
  grammar_issue_count: number;
  submitted_at: string;
  issues: WritingGrammarIssue[];
}

export interface WritingSubmission {
  id: number;
  assignment_id: number;
  student_id: number;
  status: WritingSubmissionStatus;
  draft_content: string;
  draft_word_count: number;
  draft_updated_at: string;
  first_submitted_at: string | null;
  final_submitted_at: string | null;
  revisions: WritingRevision[];
  remaining_revisions: number;
  server_time: string;
}

export interface WritingPresenceVisit {
  id: number;
  client_visit_id: string;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string;
  end_reason: string | null;
}

export interface WritingIntegrityEvent {
  id: number;
  event_type: string;
  source: string;
  detail: string | null;
  occurred_at: string;
}

export interface WritingTeacherSubmissionSummary {
  submission_id: number;
  student_id: number;
  student_no: string;
  student_name: string;
  status: WritingSubmissionStatus;
  draft_word_count: number;
  latest_revision_number: number | null;
  latest_grammar_issue_count: number;
  first_submitted_at: string | null;
  final_submitted_at: string | null;
  total_stay_seconds: number;
  total_leave_seconds: number;
  leave_count: number;
  violation_count: number;
}

export interface WritingTeacherSubmissionDetail {
  submission_id: number;
  assignment_id: number;
  assignment_title: string;
  grammar_hint_mode: WritingGrammarHintMode;
  revision_limit: number;
  student_id: number;
  student_no: string;
  student_name: string;
  status: WritingSubmissionStatus;
  draft_content: string;
  draft_word_count: number;
  first_submitted_at: string | null;
  final_submitted_at: string | null;
  revisions: WritingRevision[];
  visits: WritingPresenceVisit[];
  integrity_events: WritingIntegrityEvent[];
  total_stay_seconds: number;
  total_leave_seconds: number;
  leave_count: number;
}
