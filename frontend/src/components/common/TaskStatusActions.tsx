import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { InlineMessage } from "./States";

export function TaskStatusActions({ id, status, writing = false }: { id: number; status: string; writing?: boolean }) {
  const client = useQueryClient();
  const [closing, setClosing] = useState(false);
  const mutation = useMutation({
    mutationFn: (action: "publish" | "close") => api(`${writing ? "/writing/assignments" : "/tasks"}/${id}/${action}`, { method: "POST" }),
    onSuccess: async () => {
      setClosing(false);
      await Promise.all([writing ? "writing-assignments" : "tasks", writing ? "writing-assignment" : "task", "dashboard"].map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
  });
  return <>
    {status === "published" ? <Button size="sm" variant="secondary" onClick={() => setClosing(true)}>关闭</Button> : <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate("publish")}>{status === "closed" ? "重新开放" : "发布"}</Button>}
    {!closing && mutation.error && <span className="text-xs text-danger">{mutation.error.message}</span>}
    <Modal open={closing} onClose={() => !mutation.isPending && setClosing(false)} title="关闭任务">
      <p className="text-sm leading-7 text-muted">关闭后学生不能继续提交，已有草稿与提交记录会保留。你可以编辑任务并重新开放。</p>
      {mutation.error && <InlineMessage>{mutation.error.message}</InlineMessage>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setClosing(false)}>取消</Button><Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate("close")}>确认关闭</Button></div>
    </Modal>
  </>;
}
