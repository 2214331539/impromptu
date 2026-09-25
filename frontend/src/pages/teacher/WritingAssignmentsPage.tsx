import { useQuery } from "@tanstack/react-query";
import { Eye, PenLine, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { TaskStatusActions } from "../../components/common/TaskStatusActions";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import type { WritingAssignment } from "../../types";
import { formatDate } from "../../utils/format";
import { writingAssignmentStatusLabel, writingGrammarHintLabel } from "../../utils/writing";

export function WritingAssignmentsPage() {
  const query = useQuery({ queryKey: ["writing-assignments"], queryFn: () => api<WritingAssignment[]>("/writing/assignments") });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />;
  return <div className="page-enter">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="page-title">写作任务</h1><p className="mt-2 text-sm text-muted">创建写作作业并跟踪学生提交、语法问题和页面行为。</p></div>
      <Link to="/teacher/writing/new"><Button icon={<Plus className="h-4 w-4" />}>创建写作任务</Button></Link>
    </header>
    {query.data?.length ? <div className="space-y-3">{query.data.map((item) => <article key={item.id} className="surface p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone={item.status === "published" ? "blue" : item.status === "closed" ? "neutral" : "orange"}>{writingAssignmentStatusLabel[item.status]}</Badge><Badge>{writingGrammarHintLabel[item.grammar_hint_mode]}</Badge><span className="text-xs text-muted">{item.class_name}</span></div><h2 className="mt-3 truncate text-lg font-semibold">{item.title}</h2><p className="mt-2 text-xs text-muted">截止 {formatDate(item.due_at)} · 已提交 {item.submitted_count} / {item.participant_count}</p></div><div className="flex flex-wrap items-center gap-2 lg:justify-end"><Link to={`/teacher/writing/${item.id}/edit`}><Button size="sm" variant="secondary">编辑</Button></Link><TaskStatusActions id={item.id} status={item.status} writing /><Link to={`/teacher/writing/${item.id}/submissions`}><Button size="sm" variant="secondary" icon={<Eye className="h-3.5 w-3.5" />}>学生提交</Button></Link></div></div></article>)}</div> : <EmptyState title="还没有写作任务" description="创建写作作业，选择班级并设置语法检测策略。" action={<Link to="/teacher/writing/new"><Button icon={<PenLine className="h-4 w-4" />}>创建任务</Button></Link>} />}
  </div>;
}
