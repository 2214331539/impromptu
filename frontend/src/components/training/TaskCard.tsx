import { ArrowRight, Clock3, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { Task } from "../../types";
import { formatDate, formatDuration, phaseLabel, taskStatusLabel } from "../../utils/format";
import { Badge } from "../common/Badge";

export function TaskCard({ task }: { task: Task }) {
  const complete = task.my_phase === "submitted";
  return <Link to={`/app/tasks/${task.id}`} className="surface group block p-5 transition hover:-translate-y-0.5 hover:border-black/[.14]">
    <div className="flex items-start justify-between gap-4">
      <div><div className="flex flex-wrap items-center gap-2"><Badge tone={complete ? "green" : task.status === "published" ? "blue" : "neutral"}>{complete ? "已完成" : task.my_phase ? phaseLabel[task.my_phase] : taskStatusLabel[task.status]}</Badge><span className="text-xs text-muted">截止 {formatDate(task.due_at)}</span></div><h3 className="mt-3 text-[17px] font-semibold leading-6">{task.name}</h3></div>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/[.035] text-muted transition group-hover:bg-accent group-hover:text-white"><ArrowRight className="h-4 w-4" /></span>
    </div>
    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{task.description || "完成本次随机口语训练。"}</p>
    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-black/[.06] pt-4 text-xs text-muted"><span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{task.teacher_name}</span><span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />搜集 {formatDuration(task.research_seconds)} · 整理 {formatDuration(task.preparation_seconds)} · 演讲 {formatDuration(task.speaking_seconds)}</span></div>
  </Link>;
}
