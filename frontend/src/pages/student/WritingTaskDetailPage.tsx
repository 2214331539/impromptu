import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, FilePenLine, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ErrorState, LoadingState } from "../../components/common/States";
import type { WritingAssignment, WritingSubmission } from "../../types";
import { formatDate } from "../../utils/format";
import { writingAssignmentStatusLabel, writingGrammarHintLabel, writingSubmissionStatusLabel } from "../../utils/writing";

export function WritingTaskDetailPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["writing-assignment", assignmentId],
    queryFn: () => api<WritingAssignment>(`/writing/assignments/${assignmentId}`),
    enabled: !!assignmentId,
  });
  const start = useMutation({
    mutationFn: () => api<WritingSubmission>(`/writing/assignments/${assignmentId}/submissions`, { method: "POST" }),
    onSuccess: (submission) => navigate(`/app/writing/session/${submission.id}`),
  });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const assignment = query.data;
  const expired = (!assignment.allow_late_submission && new Date(assignment.due_at).getTime() < Date.now()) || assignment.status === "closed";
  return <div className="page-enter mx-auto max-w-4xl">
    <Link to="/app/writing" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回写作任务</Link>
    <article className="surface overflow-hidden">
      <div className="border-b border-black/[.07] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={assignment.status === "published" ? "blue" : "neutral"}>{writingAssignmentStatusLabel[assignment.status]}</Badge><span className="text-xs text-muted">{assignment.class_name}</span></div>
        <h1 className="mt-5 text-[28px] font-semibold leading-tight sm:text-[36px]">{assignment.title}</h1>
        <p className="mt-4 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-muted">{assignment.instructions || "按要求完成写作。"}</p>
      </div>
      <div className="grid gap-px bg-black/[.06] sm:grid-cols-2 lg:grid-cols-5">
        <Info label="开始时间" value={formatDate(assignment.starts_at)} />
        <Info label="截止时间" value={formatDate(assignment.due_at)} />
        <Info label="最少字数" value={`${assignment.min_words}`} />
        <Info label="最多字数" value={assignment.max_words ? `${assignment.max_words}` : "不限"} />
        <Info label="语法检测" value={writingGrammarHintLabel[assignment.grammar_hint_mode]} />
      </div>
      <div className="p-6 sm:p-8">
        <h2 className="section-title">写作规则</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-muted">
          <p className="flex items-start gap-2"><ShieldCheck className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />写作过程中不显示语法问题，首次提交后按教师设置显示标注。</p>
          <p className="flex items-start gap-2"><FilePenLine className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />首次提交后可修改 {assignment.revision_limit} 次。</p>
          <p className="flex items-start gap-2"><CalendarClock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />写作页面不允许复制粘贴。</p>
        </div>
        {start.error && <p className="mt-5 text-sm text-danger">{start.error.message}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" loading={start.isPending} disabled={!assignment.my_submission_id && (expired || new Date(assignment.starts_at).getTime() > Date.now())} icon={<FilePenLine className="h-4 w-4" />} onClick={() => assignment.my_submission_id ? navigate(`/app/writing/session/${assignment.my_submission_id}`) : start.mutate()}>
            {assignment.my_submission_id ? (assignment.my_submission_status === "finalized" ? "查看提交" : "继续写作") : expired ? "任务已截止" : "开始写作"}
          </Button>
          {assignment.my_submission_id && <Badge tone="blue">{writingSubmissionStatusLabel[assignment.my_submission_status || "drafting"]}</Badge>}
        </div>
      </div>
    </article>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/75 p-5"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-sm font-medium">{value}</p></div>;
}
