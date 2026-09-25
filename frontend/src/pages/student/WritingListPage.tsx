import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCachedState } from "../../hooks/useCachedState";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import type { WritingAssignment } from "../../types";
import { formatDate } from "../../utils/format";
import { writingAssignmentStatusLabel, writingGrammarHintLabel, writingSubmissionStatusLabel } from "../../utils/writing";

export function WritingListPage() {
  const [filter, setFilter] = useCachedState<"all" | "pending" | "done">("writing-filter", "all");
  const query = useQuery({
    queryKey: ["writing-assignments"],
    queryFn: () => api<WritingAssignment[]>("/writing/assignments"),
  });
  const assignments = useMemo(
    () =>
      (query.data || []).filter((item) => {
        if (filter === "all") return true;
        if (filter === "done") return item.my_submission_status === "finalized";
        return item.my_submission_status !== "finalized";
      }),
    [query.data, filter],
  );
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />;
  return <div className="page-enter">
    <header className="mb-8">
      <h1 className="page-title">写作任务</h1>
      <p className="mt-2 text-sm text-muted">按教师要求完成写作、提交初稿，并按规则修改。</p>
    </header>
    <div className="mb-5 inline-flex rounded-[11px] bg-black/[.045] p-1">
      {([["all", "全部"], ["pending", "待完成"], ["done", "已完成"]] as const).map(([key, label]) => (
        <button key={key} onClick={() => setFilter(key)} className={`h-8 rounded-[8px] px-3 text-sm transition ${filter === key ? "bg-white font-medium shadow-sm" : "text-muted"}`}>{label}</button>
      ))}
    </div>
    {assignments.length ? <div className="space-y-3">{assignments.map((item) => <Link key={item.id} to={`/app/writing/${item.id}`} className="surface flex flex-col gap-4 p-5 hover:bg-black/[.018] sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone={item.status === "published" ? "blue" : item.status === "closed" ? "neutral" : "orange"}>{writingAssignmentStatusLabel[item.status]}</Badge><Badge>{writingGrammarHintLabel[item.grammar_hint_mode]}</Badge><span className="text-xs text-muted">{item.class_name}</span></div><h2 className="mt-3 truncate text-lg font-semibold">{item.title}</h2><p className="mt-2 text-xs text-muted">截止 {formatDate(item.due_at)}</p></div><div className="text-right"><Badge tone={item.my_submission_status === "finalized" ? "green" : item.my_submission_status ? "blue" : "neutral"}>{item.my_submission_status ? writingSubmissionStatusLabel[item.my_submission_status] : "未开始"}</Badge></div></Link>)}</div> : <EmptyState title="暂无写作任务" description="教师发布写作作业后，会显示在这里。" />}
  </div>;
}
