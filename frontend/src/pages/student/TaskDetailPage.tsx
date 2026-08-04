import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Check, Clock3, FileText, Mic2, RefreshCw } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ErrorState, LoadingState } from "../../components/common/States";
import type { Task, TrainingSession } from "../../types";
import { formatDate, formatDuration, phaseLabel } from "../../utils/format";

export function TaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["task", taskId], queryFn: () => api<Task>(`/tasks/${taskId}`), enabled: !!taskId });
  const start = useMutation({ mutationFn: () => api<TrainingSession>(`/tasks/${taskId}/sessions`, { method: "POST" }), onSuccess: (session) => navigate(`/app/training/${session.id}`) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const task = query.data;
  const expired = new Date(task.due_at).getTime() < Date.now() || task.status === "closed";
  return <div className="page-enter mx-auto max-w-4xl">
    <Link to="/app/tasks" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />返回任务</Link>
    <article className="surface overflow-hidden"><div className="border-b border-black/[.07] p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2"><Badge tone={task.my_phase === "submitted" ? "green" : "blue"}>{task.my_phase ? phaseLabel[task.my_phase] : "待开始"}</Badge><span className="text-xs text-muted">{task.class_name}</span></div><h1 className="mt-5 text-[28px] font-semibold leading-tight sm:text-[36px]">{task.name}</h1><p className="mt-4 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-muted">{task.description || "完成本次随机口语训练。"}</p></div>
      <div className="grid gap-px bg-black/[.06] sm:grid-cols-2 lg:grid-cols-5"><Info icon={<Clock3 />} label="资料搜集" value={formatDuration(task.research_seconds)} /><Info icon={<Clock3 />} label="准备整理" value={formatDuration(task.preparation_seconds)} /><Info icon={<Clock3 />} label="演讲时间" value={formatDuration(task.speaking_seconds)} /><Info icon={<RefreshCw />} label="重新抽题" value={`${task.redraw_limit} 次`} /><Info icon={<CalendarClock />} label="截止时间" value={formatDate(task.due_at)} /></div>
      <div className="p-6 sm:p-8"><h2 className="section-title">训练规则</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Rule text="先完成麦克风试音，再由系统随机抽题" /><Rule text={`确认题目后有 ${formatDuration(task.research_seconds)} 搜集资料`} /><Rule text={`随后用 ${formatDuration(task.preparation_seconds)} 整理草稿，演讲时可查看`} /><Rule text="正式演讲开始后同步录音，完成后上传录音即可提交" /></div>
        {start.error && <p className="mt-5 text-sm text-danger">{start.error.message}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-3"><Button size="lg" loading={start.isPending} disabled={expired || task.my_phase === "submitted"} icon={<Mic2 className="h-4 w-4" />} onClick={() => task.my_session_id ? navigate(`/app/training/${task.my_session_id}`) : start.mutate()}>{task.my_phase && task.my_phase !== "submitted" ? "继续训练" : task.my_phase === "submitted" ? "训练已提交" : expired ? "任务已截止" : "开始训练并试音"}</Button>{task.my_phase === "submitted" && task.my_session_id && <Button variant="secondary" size="lg" icon={<FileText className="h-4 w-4" />} onClick={() => navigate(`/app/history/${task.my_session_id}`)}>查看结果</Button>}</div>
      </div>
    </article>
  </div>;
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="bg-white/75 p-5"><span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span><p className="mt-3 text-xs text-muted">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function Rule({ text }: { text: string }) { return <p className="flex items-start gap-2 text-sm leading-6 text-muted"><Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />{text}</p>; }
