import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, ClipboardList, Gauge, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import { TaskCard } from "../../components/training/TaskCard";
import { useAuthStore } from "../../stores/auth";
import type { Dashboard } from "../../types";
import { formatDate, phaseLabel } from "../../utils/format";

export function StudentDashboard() {
  const user = useAuthStore((s) => s.user);
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const { metrics, pending_tasks: tasks, recent_sessions: recent } = query.data;
  return <div className="page-enter space-y-10">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm text-muted">{new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1 className="page-title mt-2">你好，{user?.name}</h1><p className="mt-2 text-[15px] text-muted">保持思路清楚，下一次表达会更自然。</p></div>{tasks[0] && <Link to={`/app/tasks/${tasks[0].id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-ink px-4 text-sm font-medium text-white"><PlayCircle className="h-4 w-4" />开始训练</Link>}</header>
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Metric icon={<CheckCircle2 />} label="已完成训练" value={metrics.completed || 0} suffix="次" />
      <Metric icon={<Gauge />} label="平均评分" value={metrics.average_score || 0} suffix="分" />
      <Metric icon={<ClipboardList />} label="待完成任务" value={metrics.pending || 0} suffix="项" />
    </section>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="section-title">待完成任务</h2><Link className="flex items-center gap-1 text-sm text-accent" to="/app/tasks">全部任务<ArrowRight className="h-3.5 w-3.5" /></Link></div>{tasks.length ? <div className="grid gap-4 lg:grid-cols-2">{tasks.slice(0, 4).map((task) => <TaskCard key={task.id} task={task} />)}</div> : <EmptyState title="任务已经完成" description="当前没有待完成的口语训练。" />}</section>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="section-title">最近训练</h2><Link className="flex items-center gap-1 text-sm text-accent" to="/app/history">查看记录<ArrowRight className="h-3.5 w-3.5" /></Link></div>
      {recent.length ? <div className="surface divide-y divide-black/[.06] overflow-hidden">{recent.map((session) => <Link to={`/app/history/${session.id}`} key={session.id} className="flex items-center gap-4 px-5 py-4 hover:bg-black/[.018]"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.task.name}</p><p className="mt-1 truncate text-xs text-muted">{session.final_topic?.prompt || "尚未确认题目"}</p></div><div className="text-right"><Badge tone={session.evaluation ? "green" : session.phase === "submitted" ? "blue" : "orange"}>{session.evaluation ? `${session.evaluation.total_score} 分` : phaseLabel[session.phase]}</Badge><p className="mt-1.5 text-[11px] text-muted">{formatDate(session.submitted_at || session.server_time)}</p></div></Link>)}</div> : <EmptyState title="还没有训练记录" description="完成第一项任务后，录音和反馈会出现在这里。" />}
    </section>
  </div>;
}

function Metric({ icon, label, value, suffix }: { icon: React.ReactNode; label: string; value: number; suffix: string }) {
  return <div className="surface flex items-center gap-4 p-5"><span className="grid h-10 w-10 place-items-center rounded-[12px] bg-black/[.04] text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span><div><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}<span className="ml-1 text-xs font-normal text-muted">{suffix}</span></p></div></div>;
}

