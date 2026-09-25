import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCachedState } from "../../hooks/useCachedState";
import { api } from "../../api/client";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/States";
import { TaskCard } from "../../components/training/TaskCard";
import type { Task } from "../../types";

export function TaskListPage() {
  const [filter, setFilter] = useCachedState<"all" | "pending" | "done">("oral-filter", "all");
  const query = useQuery({ queryKey: ["tasks"], queryFn: () => api<Task[]>("/tasks") });
  const tasks = useMemo(
    () => (query.data || []).filter((task) => filter === "all" || (filter === "done" ? task.my_phase === "submitted" : task.my_phase !== "submitted")),
    [query.data, filter],
  );
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />;
  return <div className="page-enter">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="page-title">口语任务</h1><p className="mt-2 text-sm text-muted">按任务要求完成随机抽题、准备与限时表达。</p></div>
    </header>
    <div className="mb-5 inline-flex rounded-[11px] bg-black/[.045] p-1">{([['all', '全部'], ['pending', '待完成'], ['done', '已完成']] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`h-8 rounded-[8px] px-3 text-sm transition ${filter === key ? "bg-white font-medium shadow-sm" : "text-muted"}`}>{label}</button>)}</div>
    {tasks.length ? <div className="grid gap-4 lg:grid-cols-2">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div> : <EmptyState title="没有匹配的任务" description="切换筛选条件，或到首页使用邀请码加入班级。" />}

  </div>;
}
