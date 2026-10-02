import { useEffect, useState } from "react";
import { Badge } from "./Badge";

export function DeadlineNotice({ dueAt, submittedAt, active = true, compact = false }: {
  dueAt: string;
  submittedAt?: string | null;
  active?: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const deadline = new Date(dueAt).getTime();
  useEffect(() => {
    if (!active || submittedAt || !Number.isFinite(deadline)) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (current <= deadline) timer = setTimeout(update, Math.min(deadline - current + 1, 86_400_000));
    };
    update();
    window.addEventListener("focus", update);
    return () => { clearTimeout(timer); window.removeEventListener("focus", update); };
  }, [active, deadline, submittedAt]);

  // Completed work is compared with its submission time, never today's date.
  if (!active || (submittedAt ? new Date(submittedAt).getTime() : now) <= deadline || !Number.isFinite(deadline)) return null;
  const label = submittedAt ? "逾期补交" : "已逾期 · 可补交";
  return compact ? <Badge tone="orange">{label}</Badge> : <div role="status" className="mb-5 rounded-[12px] border border-orange-200 bg-orange-50 p-4 text-sm text-warning">
    {submittedAt ? "本次作业已逾期补交，提交内容已保存。" : "本次作业已逾期，仍可继续完成并提交。"}
  </div>;
}
