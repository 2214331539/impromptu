import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import type { WritingAssignment, WritingTeacherSubmissionSummary } from "../../types";
import { formatDuration } from "../../utils/format";
import { writingSubmissionStatusLabel } from "../../utils/writing";

export function WritingSubmissionsPage() {
  const { assignmentId } = useParams();
  const assignment = useQuery({ queryKey: ["writing-assignment", assignmentId], queryFn: () => api<WritingAssignment>(`/writing/assignments/${assignmentId}`), enabled: !!assignmentId });
  const submissions = useQuery({ queryKey: ["writing-submissions", assignmentId], queryFn: () => api<WritingTeacherSubmissionSummary[]>(`/writing/assignments/${assignmentId}/submissions`), enabled: !!assignmentId });
  if (assignment.isLoading || submissions.isLoading) return <LoadingState />;
  if (assignment.isError || submissions.isError || !assignment.data) return <ErrorState message={assignment.error?.message || submissions.error?.message} />;
  return <div className="page-enter">
    <Link to="/teacher/writing" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回写作任务</Link>
    <header className="mb-7"><h1 className="page-title">{assignment.data.title}</h1><p className="mt-2 text-sm text-muted">{assignment.data.class_name} · 已提交 {assignment.data.submitted_count} / {assignment.data.participant_count}</p></header>
    {submissions.data?.length ? <div className="surface overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead><tr className="border-b border-black/[.06] text-xs text-muted"><th className="px-5 py-3 font-medium">学生</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">版本</th><th className="px-5 py-3 font-medium">字数</th><th className="px-5 py-3 font-medium">语法问题</th><th className="px-5 py-3 font-medium">停留</th><th className="px-5 py-3 font-medium">离开</th><th className="px-5 py-3 font-medium">违规</th><th /></tr></thead><tbody>{submissions.data.map((item) => <tr key={item.submission_id} className="border-b border-black/[.05] last:border-0"><td className="px-5 py-4"><p className="text-sm font-medium">{item.student_name}</p><p className="mt-1 text-xs text-muted">{item.student_no}</p></td><td className="px-5 py-4"><Badge tone={item.status === "finalized" ? "green" : "blue"}>{writingSubmissionStatusLabel[item.status]}</Badge></td><td className="px-5 py-4 text-sm text-muted">{item.latest_revision_number ?? "—"}</td><td className="px-5 py-4 text-sm text-muted">{item.draft_word_count}</td><td className="px-5 py-4 text-sm text-muted">{item.latest_grammar_issue_count}</td><td className="px-5 py-4 text-sm text-muted">{formatDuration(item.total_stay_seconds)}</td><td className="px-5 py-4 text-sm text-muted">{formatDuration(item.total_leave_seconds)}</td><td className="px-5 py-4 text-sm text-muted">{item.violation_count}</td><td className="px-5 py-4"><Link className="inline-flex items-center gap-1.5 text-sm text-accent" to={`/teacher/writing/submissions/${item.submission_id}`}><Eye className="h-3.5 w-3.5" />查看</Link></td></tr>)}</tbody></table></div> : <EmptyState title="暂无写作进度" description="还没有学生开始这项写作作业。" />}
  </div>;
}
