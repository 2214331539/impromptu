import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { TrainingSession } from "../../types";
import { Button } from "./Button";
import { InlineMessage } from "./States";
import { formatDate } from "../../utils/format";

export function ReturnHistory({ session }: { session: TrainingSession }) {
  if (!session.return_history.length) return null;
  return <section className="surface mb-5 p-5" aria-label="退回记录">
    <h2 className="section-title">{session.phase === "submitted" ? "退回记录（已重新提交）" : "作业已退回，请检查后重新提交"}</h2>
    {session.return_history.map((entry, index) => <div key={index} className="mt-3 border-t border-black/[.06] pt-3">
      <p className="text-xs text-muted">第 {index + 1} 次退回 · {formatDate(entry.returned_at)}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{entry.reason}</p>
      {entry.evaluation && <p className="mt-2 text-xs text-muted">退回前评价：{entry.evaluation.total_score} 分 · {entry.evaluation.comment || "无评语"}</p>}
    </div>)}
    {session.phase !== "submitted" && <p className="mt-3 text-sm text-muted">原题目和录音已保留。每次退回额外增加一次重录机会，也可确认原录音后重新提交。</p>}
  </section>;
}

export function ReturnSubmission({ session }: { session: TrainingSession }) {
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api<TrainingSession>(`/sessions/${session.id}/return`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: (data) => {
      client.setQueryData(["session", session.id], data);
      void client.invalidateQueries({ queryKey: ["submissions"] });
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["task"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      setReason("");
    },
  });
  if (session.phase !== "submitted") return null;
  const closed = session.task.status !== "published" || new Date(session.task.due_at).getTime() <= Date.now();
  return <section className="surface mb-5 p-5">
    <h2 className="section-title">退回修改</h2>
    <p className="mt-2 text-sm text-muted">学生误交或需要重新录制时，可退回作业。当前评价将撤回并存入退回记录，学生重新提交后再评价。</p>
    {closed && <p className="mt-2 text-sm text-warning">请先在口语任务管理中重新开放任务并延长截止时间。</p>}
    <label htmlFor="oral-return-reason" className="mt-4 block text-sm font-medium">退回原因</label>
    <textarea id="oral-return-reason" className="field mt-2 min-h-24" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：录音不完整，请重新录制后提交。" />
    {mutation.error && <InlineMessage>{mutation.error.message}</InlineMessage>}
    <Button className="mt-3" variant="danger" disabled={closed || !reason.trim()} loading={mutation.isPending} onClick={() => { if (window.confirm("确认退回这份口语作业？学生将可重新提交，当前评价会撤回并保留记录。")) mutation.mutate(); }}>退回修改</Button>
  </section>;
}
