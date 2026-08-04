import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { EmptyState, ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import type { ClassRoom, Member } from "../../types";

export function ClassesPage() {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<ClassRoom[]>("/classes") });
  useEffect(() => { if (!selectedId && classes.data?.length) setSelectedId(classes.data[0].id); }, [classes.data, selectedId]);
  const members = useQuery({ queryKey: ["class-members", selectedId], queryFn: () => api<Member[]>(`/classes/${selectedId}/members`), enabled: !!selectedId });
  const create = useMutation({ mutationFn: () => api<ClassRoom>("/classes", { method: "POST", body: JSON.stringify({ name }) }), onSuccess: async (item) => { setOpen(false); setName(""); setSelectedId(item.id); await client.invalidateQueries({ queryKey: ["classes"] }); } });
  const remove = useMutation({ mutationFn: (studentId: number) => api<void>(`/classes/${selectedId}/members/${studentId}`, { method: "DELETE" }), onSuccess: () => client.invalidateQueries({ queryKey: ["class-members", selectedId] }) });
  if (classes.isLoading) return <LoadingState />;
  if (classes.isError) return <ErrorState message={classes.error.message} retry={() => classes.refetch()} />;
  const selected = classes.data?.find((item) => item.id === selectedId);
  return <div className="page-enter"><header className="mb-8 flex items-end justify-between gap-4"><div><h1 className="page-title">班级管理</h1><p className="mt-2 text-sm text-muted">管理学生名单与班级邀请码。</p></div><Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>创建班级</Button></header>
    {!classes.data?.length ? <EmptyState title="还没有班级" description="创建班级后，将邀请码发给学生即可加入。" action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>创建班级</Button>} /> : <div className="grid gap-5 lg:grid-cols-[280px_1fr]"><aside className="surface h-fit p-2">{classes.data.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-[12px] p-3 text-left transition ${selectedId === item.id ? "bg-black/[.055]" : "hover:bg-black/[.025]"}`}><p className="text-sm font-medium">{item.name}</p><p className="mt-1 text-xs text-muted">{item.student_count} 名学生 · {item.task_count} 项任务</p></button>)}</aside>
      <section className="surface overflow-hidden"><div className="flex flex-col gap-4 border-b border-black/[.06] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">{selected?.name}</h2><p className="mt-1 text-xs text-muted">{selected?.student_count} 名学生</p></div><button onClick={() => selected && navigator.clipboard.writeText(selected.invite_code)} className="flex items-center gap-2 rounded-[10px] bg-black/[.04] px-3 py-2 text-xs"><span className="text-muted">邀请码</span><strong className="tracking-widest">{selected?.invite_code}</strong><Copy className="h-3.5 w-3.5 text-muted" /></button></div>
        {members.isLoading ? <LoadingState /> : members.isError ? <ErrorState message={members.error.message} retry={() => members.refetch()} /> : members.data?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-black/[.06] text-xs text-muted"><th className="px-5 py-3 font-medium">学生</th><th className="px-5 py-3 font-medium">学号</th><th className="px-5 py-3 font-medium">已完成</th><th className="px-5 py-3 font-medium">平均分</th><th /></tr></thead><tbody>{members.data.map((member) => <tr key={member.id} className="border-b border-black/[.05] last:border-0"><td className="px-5 py-4 text-sm font-medium">{member.name}</td><td className="px-5 py-4 text-sm text-muted">{member.student_no}</td><td className="px-5 py-4 text-sm text-muted">{member.completed_count} 次</td><td className="px-5 py-4 text-sm text-muted">{member.average_score ?? "—"}</td><td className="px-5 py-4 text-right"><button title="移除学生" onClick={() => confirm(`确定将 ${member.name} 移出班级？`) && remove.mutate(member.id)} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-red-50 hover:text-danger"><UserMinus className="h-4 w-4" /></button></td></tr>)}</tbody></table></div> : <EmptyState title="班级还没有学生" description={`将邀请码 ${selected?.invite_code || ""} 发给学生。`} />}
      </section></div>}
    <Modal open={open} onClose={() => setOpen(false)} title="创建班级"><label className="label">班级名称</label><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 高二英语口语 A 班" autoFocus />{create.error && <div className="mt-3"><InlineMessage>{create.error.message}</InlineMessage></div>}<div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button loading={create.isPending} disabled={name.trim().length < 2} onClick={() => create.mutate()}>创建</Button></div></Modal>
  </div>;
}
