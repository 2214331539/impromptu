import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Headphones } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import type { Task, TrainingSession } from "../../types";
import { formatDate, formatDuration, phaseLabel } from "../../utils/format";

export function SubmissionsPage() {
  const { taskId } = useParams();
  const task = useQuery({ queryKey: ["task", taskId], queryFn: () => api<Task>(`/tasks/${taskId}`) });
  const sessions = useQuery({ queryKey: ["submissions", taskId], queryFn: () => api<TrainingSession[]>(`/tasks/${taskId}/submissions`) });
  if (task.isLoading || sessions.isLoading) return <LoadingState />;
  if (task.isError || sessions.isError || !task.data) return <ErrorState message={task.error?.message || sessions.error?.message} />;
  return <div className="page-enter"><Link to="/teacher/tasks" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回任务</Link><header className="mb-7"><h1 className="page-title">{task.data.name}</h1><p className="mt-2 text-sm text-muted">{task.data.class_name} · {task.data.completed_count} / {task.data.participant_count} 已完成</p></header>
    {sessions.data?.length ? <div className="surface overflow-x-auto"><table className="w-full min-w-[880px] text-left"><thead><tr className="border-b border-black/[.06] text-xs text-muted"><th className="px-5 py-3 font-medium">学生</th><th className="px-5 py-3 font-medium">抽取题目</th><th className="px-5 py-3 font-medium">演讲时长</th><th className="px-5 py-3 font-medium">提交时间</th><th className="px-5 py-3 font-medium">提交状态</th><th className="px-5 py-3 font-medium">评价</th><th /></tr></thead><tbody>{sessions.data.map((s) => { const seconds = s.speaking_started_at && s.speaking_finished_at ? (new Date(s.speaking_finished_at).getTime() - new Date(s.speaking_started_at).getTime()) / 1000 : 0; return <tr key={s.id} className="border-b border-black/[.05] last:border-0"><td className="px-5 py-4"><p className="text-sm font-medium">{s.student_name}</p><p className="mt-1 text-xs text-muted">{s.student_no}</p></td><td className="max-w-sm px-5 py-4 text-sm leading-5 text-muted">{s.final_topic?.prompt || "—"}</td><td className="px-5 py-4 text-sm text-muted">{seconds ? formatDuration(seconds) : "—"}</td><td className="px-5 py-4 text-xs text-muted">{formatDate(s.submitted_at)}</td><td className="px-5 py-4"><Badge tone={s.phase === "submitted" ? "green" : "orange"}>{phaseLabel[s.phase]}</Badge></td><td className="px-5 py-4"><Badge tone={s.evaluation ? "blue" : "neutral"}>{s.evaluation ? `${s.evaluation.total_score} 分` : "待评价"}</Badge></td><td className="px-5 py-4">{s.phase === "submitted" && <Link className="inline-flex items-center gap-1.5 text-sm text-accent" to={`/teacher/evaluations/${s.id}`}><Headphones className="h-3.5 w-3.5" />{s.evaluation ? "查看评价" : "听取并评价"}</Link>}</td></tr>; })}</tbody></table></div> : <EmptyState title="暂无训练进度" description="还没有学生开始这项任务。" />}
  </div>;
}

