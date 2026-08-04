import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { EmptyState, ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import { TaskCard } from "../../components/training/TaskCard";
import type { ClassRoom, Task } from "../../types";

export function TaskListPage() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const query = useQuery({ queryKey: ["tasks"], queryFn: () => api<Task[]>("/tasks") });
  const join = useMutation({
    mutationFn: () => api<ClassRoom>("/classes/join", { method: "POST", body: JSON.stringify({ invite_code: inviteCode }) }),
    onSuccess: async () => {
      setJoinOpen(false);
      setInviteCode("");
      await client.invalidateQueries({ queryKey: ["tasks"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const tasks = useMemo(
    () => (query.data || []).filter((task) => filter === "all" || (filter === "done" ? task.my_phase === "submitted" : task.my_phase !== "submitted")),
    [query.data, filter],
  );
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} retry={() => query.refetch()} />;
  return <div className="page-enter">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="page-title">训练任务</h1><p className="mt-2 text-sm text-muted">按任务要求完成随机抽题、准备与限时表达。</p></div>
      <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setJoinOpen(true)}>加入班级</Button>
    </header>
    <div className="mb-5 inline-flex rounded-[11px] bg-black/[.045] p-1">{([['all', '全部'], ['pending', '待完成'], ['done', '已完成']] as const).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`h-8 rounded-[8px] px-3 text-sm transition ${filter === key ? "bg-white font-medium shadow-sm" : "text-muted"}`}>{label}</button>)}</div>
    {tasks.length ? <div className="grid gap-4 lg:grid-cols-2">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div> : <EmptyState title="没有匹配的任务" description="切换筛选条件，或使用教师提供的邀请码加入班级。" />}
    <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="加入班级">
      <label className="label">班级邀请码</label>
      <input className="field uppercase tracking-widest" value={inviteCode} maxLength={12} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="例如 SPEAK6" />
      {join.error && <div className="mt-3"><InlineMessage>{join.error.message}</InlineMessage></div>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setJoinOpen(false)}>取消</Button><Button disabled={inviteCode.length < 4} loading={join.isPending} onClick={() => join.mutate()}>加入</Button></div>
    </Modal>
  </div>;
}
