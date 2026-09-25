import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { ClassRoom } from "../../types";
import { Button } from "./Button";
import { InlineMessage } from "./States";

export function JoinClass() {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState("");
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<ClassRoom[]>("/classes") });
  const join = useMutation({
    mutationFn: () => api<ClassRoom>("/classes/join", { method: "POST", body: JSON.stringify({ invite_code: code.trim().toUpperCase() }) }),
    onSuccess: async (classroom) => {
      setJoined(classroom.name); setCode("");
      await Promise.all(["classes", "tasks", "task", "dashboard", "writing-assignments", "writing-assignment"].map((key) => client.invalidateQueries({ queryKey: [key] })));
    },
  });
  return <section className="surface p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div><h2 className="section-title">我的班级</h2><p className="mt-2 text-sm text-muted">加入一次班级，即可同步接收口语任务和写作任务。</p><div className="mt-3 flex flex-wrap gap-2">{classes.data?.map((item) => <span key={item.id} className="rounded-lg bg-black/5 px-3 py-1.5 text-xs">{item.name}</span>)}</div></div><form className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); join.mutate(); }}><input aria-label="班级邀请码" className="field min-w-0 uppercase sm:w-44" placeholder="输入班级邀请码" value={code} maxLength={12} onChange={(e) => setCode(e.target.value.toUpperCase())} /><Button type="submit" disabled={code.trim().length < 4} loading={join.isPending}>加入班级</Button></form></div>{join.error && <div className="mt-4"><InlineMessage>{join.error.message}</InlineMessage></div>}{classes.isError && <p className="mt-3 text-sm text-danger">班级加载失败，请刷新重试。</p>}{joined && <p role="status" className="mt-4 text-sm text-success">已加入「{joined}」，口语任务和写作任务已同步刷新。</p>}</section>;
}
