import type { Difficulty, SessionPhase, TaskStatus } from "../types";

export function formatDate(value: string | null, withTime = true): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return minutes ? `${minutes} 分 ${rest ? `${rest} 秒` : ""}`.trim() : `${rest} 秒`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export const phaseLabel: Record<SessionPhase, string> = {
  mic_check: "试音中", drawing: "待抽题", researching: "搜集中", preparing: "整理中", speaking: "演讲中", review: "待提交", submitted: "已提交",
};
export const taskStatusLabel: Record<TaskStatus, string> = { draft: "草稿", published: "进行中", closed: "已关闭" };
export const difficultyLabel: Record<Difficulty, string> = { easy: "基础", medium: "进阶", hard: "挑战" };
