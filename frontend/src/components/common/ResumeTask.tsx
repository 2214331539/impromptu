import { Link } from "react-router-dom";
import { cacheKey, readCache, type TaskPosition } from "../../utils/taskCache";

export function ResumeTask() {
  const task = readCache<TaskPosition>(cacheKey("last-task"));
  if (!task || !/^\/(app|teacher)\//.test(task.path)) return null;
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5"><div><p className="text-sm font-medium">继续上次的任务</p><p className="mt-1 text-xs text-muted">{task.title} · 本机已保留进度</p></div><Link className="rounded-xl bg-ink px-4 py-2.5 text-sm text-white" to={task.path}>恢复进度</Link></div>;
}
