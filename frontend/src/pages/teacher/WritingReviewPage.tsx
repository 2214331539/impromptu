import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { ErrorState, LoadingState } from "../../components/common/States";
import type { WritingTeacherSubmissionDetail, WritingRevision } from "../../types";
import { formatDate, formatDuration } from "../../utils/format";
import { writingGrammarStatusLabel, writingSubmissionStatusLabel } from "../../utils/writing";

export function WritingReviewPage() {
  const { submissionId } = useParams();
  const query = useQuery({
    queryKey: ["writing-teacher-submission", submissionId],
    queryFn: () => api<WritingTeacherSubmissionDetail>(`/writing/submissions/${submissionId}/teacher`),
    enabled: !!submissionId,
  });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const data = query.data;
  return <div className="page-enter mx-auto max-w-6xl">
    <Link to={`/teacher/writing/${data.assignment_id}/submissions`} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回提交列表</Link>
    <header className="mb-7"><div className="flex flex-wrap items-center gap-2"><Badge tone={data.status === "finalized" ? "green" : "blue"}>{writingSubmissionStatusLabel[data.status]}</Badge><span className="text-xs text-muted">{data.student_no}</span></div><h1 className="mt-4 text-2xl font-semibold">{data.assignment_title}</h1><p className="mt-2 text-sm text-muted">{data.student_name} · {formatDate(data.final_submitted_at || data.first_submitted_at)}</p></header>
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section className="surface overflow-hidden">
        <div className="border-b border-black/[.06] p-6"><h2 className="section-title">提交版本</h2></div>
        <div className="divide-y divide-black/[.055]">
          {data.revisions.length ? data.revisions.map((revision) => <RevisionBlock key={revision.id} revision={revision} />) : <p className="p-6 text-sm text-muted">学生尚未提交版本。</p>}
        </div>
      </section>
      <aside className="space-y-5">
        <section className="surface p-6">
          <h2 className="section-title">页面行为</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="总停留" value={formatDuration(data.total_stay_seconds)} />
            <Metric label="总离开" value={formatDuration(data.total_leave_seconds)} />
            <Metric label="离开次数" value={`${data.leave_count}`} />
            <Metric label="违规次数" value={`${data.integrity_events.length}`} />
          </div>
        </section>
        <section className="surface p-6">
          <h2 className="section-title">停留/离开记录</h2>
          <div className="mt-4 space-y-2">{data.visits.length ? data.visits.map((visit) => <div key={visit.id} className="rounded-[11px] border border-black/[.07] p-3 text-xs"><p className="font-medium">{formatDate(visit.started_at)} → {visit.ended_at ? formatDate(visit.ended_at) : "当前"}</p><p className="mt-1 text-muted">{visit.end_reason || "进行中"} · 时长 {formatDuration(((visit.ended_at ? new Date(visit.ended_at).getTime() : Date.now()) - new Date(visit.started_at).getTime()) / 1000)}</p></div>) : <p className="text-sm text-muted">暂无记录。</p>}</div>
        </section>
        <section className="surface p-6">
          <h2 className="section-title">违规尝试</h2>
          <div className="mt-4 space-y-2">{data.integrity_events.length ? data.integrity_events.map((event) => <div key={event.id} className="rounded-[11px] border border-black/[.07] p-3 text-xs"><p className="font-medium">{event.event_type}</p><p className="mt-1 text-muted">{event.source} · {formatDate(event.occurred_at)}</p></div>) : <p className="text-sm text-muted">暂无违规记录。</p>}</div>
        </section>
      </aside>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[11px] border border-black/[.07] bg-white p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

function RevisionBlock({ revision }: { revision: WritingRevision }) {
  return <div className="p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">版本 {revision.revision_number}</h3><Badge tone={revision.grammar_status === "completed" ? "green" : revision.grammar_status === "failed" ? "orange" : "neutral"}>{writingGrammarStatusLabel[revision.grammar_status]}</Badge></div><span className="text-xs text-muted">{formatDate(revision.submitted_at)} · {revision.word_count} 字</span></div><div className="mt-4 whitespace-pre-wrap rounded-[12px] bg-[#fafafa] p-4 text-[15px] leading-7">{revision.content}</div>{revision.grammar_status === "completed" && <div className="mt-4 space-y-2">{revision.issues.map((issue) => <div key={issue.id} className="rounded-[11px] border border-black/[.07] p-3 text-sm"><span className="font-medium">{issue.message}</span><span className="ml-2 text-xs text-muted">第 {issue.start_offset}-{issue.end_offset} 字符</span></div>)}</div>}</div>;
}
