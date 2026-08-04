import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, Eye, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import type { Task } from "../../types";
import { formatDate, taskStatusLabel } from "../../utils/format";

export function TasksPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["tasks"], queryFn: () => api<Task[]>("/tasks") });
  const status = useMutation({ mutationFn: ({ id, action }: { id: number; action: "publish" | "close" }) => api<Task>(`/tasks/${id}/${action}`, { method: "POST" }), onSuccess: () => client.invalidateQueries({ queryKey: ["tasks"] }) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />;
  return <div className="page-enter"><header className="mb-8 flex items-end justify-between gap-4"><div><h1 className="page-title">任务管理</h1><p className="mt-2 text-sm text-muted">发布训练任务并跟踪班级完成情况。</p></div><Link to="/teacher/tasks/new"><Button icon={<Plus className="h-4 w-4" />}>创建任务</Button></Link></header>
    {query.data?.length ? <div className="space-y-3">{query.data.map((task) => <article key={task.id} className="surface p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone={task.status === "published" ? "blue" : task.status === "closed" ? "neutral" : "orange"}>{taskStatusLabel[task.status]}</Badge><span className="text-xs text-muted">{task.class_name}</span></div><h2 className="mt-3 truncate text-lg font-semibold">{task.name}</h2><p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><CalendarClock className="h-3.5 w-3.5" />截止 {formatDate(task.due_at)}</p></div><div className="w-full lg:w-52"><div className="mb-2 flex justify-between text-xs"><span className="text-muted">完成进度</span><span className="font-medium">{task.completed_count} / {task.participant_count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-black/[.06]"><div className="h-full rounded-full bg-success" style={{ width: `${task.completion_rate}%` }} /></div><p className="mt-2 text-right text-[11px] text-muted">{task.completion_rate}%</p></div><div className="flex flex-wrap items-center gap-2 lg:justify-end">{task.status === "draft" && <Button size="sm" loading={status.isPending} onClick={() => status.mutate({ id: task.id, action: "publish" })}>发布</Button>}{task.status === "published" && <Button size="sm" variant="secondary" loading={status.isPending} onClick={() => status.mutate({ id: task.id, action: "close" })}>关闭</Button>}<Link to={`/teacher/tasks/${task.id}/submissions`}><Button size="sm" variant="secondary" icon={<Eye className="h-3.5 w-3.5" />}>学生提交</Button></Link></div></div></article>)}</div> : <EmptyState title="还没有训练任务" description="选择班级和题库，创建第一项随机口语训练。" action={<Link to="/teacher/tasks/new"><Button icon={<ClipboardList className="h-4 w-4" />}>创建任务</Button></Link>} />}
  </div>;
}

