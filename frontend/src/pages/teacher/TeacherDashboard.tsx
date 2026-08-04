import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, ClipboardCheck, School, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import { useAuthStore } from "../../stores/auth";
import type { Dashboard } from "../../types";
import { formatDate, phaseLabel } from "../../utils/format";

export function TeacherDashboard() {
  const user = useAuthStore((s) => s.user);
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const { metrics, recent_sessions: recent } = query.data;
  return <div className="page-enter space-y-9"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm text-muted">教学工作台</p><h1 className="page-title mt-2">{user?.name}，下午好</h1><p className="mt-2 text-sm text-muted">这里是班级训练的最新进度。</p></div><Link to="/teacher/tasks/new" className="inline-flex h-11 items-center justify-center rounded-[11px] bg-ink px-4 text-sm font-medium text-white">创建训练任务</Link></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric icon={<School />} label="班级" value={metrics.classes || 0} /><Metric icon={<UsersRound />} label="学生" value={metrics.students || 0} /><Metric icon={<ClipboardCheck />} label="进行中任务" value={metrics.active_tasks || 0} /><Metric icon={<CheckCircle2 />} label="待评价" value={metrics.pending_evaluation || 0} /><Metric label="任务完成率" value={metrics.completion_rate || 0} suffix="%" /></section>
    <section><div className="mb-4 flex items-center justify-between"><h2 className="section-title">最近学生提交</h2><Link to="/teacher/tasks" className="flex items-center gap-1 text-sm text-accent">任务管理<ArrowRight className="h-3.5 w-3.5" /></Link></div>{recent.length ? <div className="surface overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b border-black/[.06] text-xs text-muted"><th className="px-5 py-3 font-medium">学生</th><th className="px-5 py-3 font-medium">任务</th><th className="px-5 py-3 font-medium">题目</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">时间</th><th /></tr></thead><tbody>{recent.map((s) => <tr key={s.id} className="border-b border-black/[.05] last:border-0"><td className="px-5 py-4 text-sm font-medium">{s.student_name}</td><td className="px-5 py-4 text-sm text-muted">{s.task.name}</td><td className="max-w-xs truncate px-5 py-4 text-sm text-muted">{s.final_topic?.prompt || "—"}</td><td className="px-5 py-4"><Badge tone={s.evaluation ? "green" : s.phase === "submitted" ? "orange" : "neutral"}>{s.evaluation ? "已评价" : phaseLabel[s.phase]}</Badge></td><td className="px-5 py-4 text-xs text-muted">{formatDate(s.submitted_at)}</td><td className="px-5 py-4">{s.phase === "submitted" && <Link className="text-sm text-accent" to={`/teacher/evaluations/${s.id}`}>{s.evaluation ? "查看" : "评价"}</Link>}</td></tr>)}</tbody></table></div> : <EmptyState title="暂无学生提交" description="学生提交训练后，会出现在这里。" />}</section>
  </div>;
}

function Metric({ icon, label, value, suffix = "" }: { icon?: React.ReactNode; label: string; value: number; suffix?: string }) { return <div className="surface p-4"><div className="flex items-center justify-between text-muted"><span className="text-xs">{label}</span><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span></div><p className="mt-4 text-2xl font-semibold tabular-nums">{value}<span className="text-sm">{suffix}</span></p></div>; }

