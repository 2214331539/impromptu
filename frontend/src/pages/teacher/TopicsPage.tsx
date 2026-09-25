import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Layers3, Plus, Power, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { Modal } from "../../components/common/Modal";
import { EmptyState, ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import { AiTopicImportModal } from "../../features/topics/AiTopicImportModal";
import { useCachedState } from "../../hooks/useCachedState";
import type { Topic, TopicBank, TopicImportCommit } from "../../types";

export function TopicsPage() {
  const client = useQueryClient();
  const [selectedBank, setSelectedBank] = useCachedState<number | null>("topic-bank", null);
  const [search, setSearch] = useCachedState("topic-search", "");
  const [bankModal, setBankModal] = useState(false);
  const [topicModal, setTopicModal] = useState(false);
  const [aiTarget, setAiTarget] = useState<TopicBank | "new" | null>(null);
  const [bankName, setBankName] = useState("");
  const [editing, setEditing] = useState<Topic | null>(null);
  const banks = useQuery({ queryKey: ["topic-banks"], queryFn: () => api<TopicBank[]>("/topic-banks") });
  const bank = banks.data?.find((item) => item.id === selectedBank) ?? banks.data?.[0];
  const [drafts, setDrafts] = useCachedState<Record<string, string>>("topic-drafts", {});
  const draftKey = editing ? "edit:" + editing.id : "bank:" + bank?.id;
  const draft = drafts[draftKey] ?? editing?.prompt ?? "";
  const setDraft = (text: string) => setDrafts((old) => ({ ...old, [draftKey]: text }));
  const [notice, setNotice] = useState("");
  const topics = useQuery({ queryKey: ["topics", bank?.id], queryFn: () => api<Topic[]>("/topic-banks/" + bank?.id + "/topics"), enabled: !!bank });
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["topics"] }), client.invalidateQueries({ queryKey: ["topic-banks"] })]);
  const create = useMutation({ mutationFn: () => api<TopicBank>("/topic-banks", { method: "POST", body: JSON.stringify({ name: bankName }) }), onSuccess: async (item) => { setSelectedBank(item.id); setBankName(""); setBankModal(false); await refresh(); } });
  const lines = draft.split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
  const save = useMutation({
    mutationFn: async () => {
      if (editing) { await api("/topics/" + editing.id, { method: "PATCH", body: JSON.stringify({ prompt: draft.trim() }) }); return 1; }
      const result = await api<TopicImportCommit>("/topic-banks/" + bank?.id + "/topics/batch", { method: "POST", body: JSON.stringify({ topics: lines.map((prompt) => ({ prompt })) }) });
      return result.topics.length;
    },
    onSuccess: async (count) => { if (editing) setDrafts((old) => { const next = { ...old }; delete next[draftKey]; return next; }); else setDraft(""); setNotice(editing ? "题目已更新" : "已添加 " + count + " 道题目，重复题目已跳过。可以继续输入下一批。"); if (editing) setTopicModal(false); await refresh(); },
  });
  const update = useMutation({ mutationFn: (topic: Topic) => api("/topics/" + topic.id, { method: "PATCH", body: JSON.stringify({ is_active: !topic.is_active }) }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api("/topics/" + id, { method: "DELETE" }), onSuccess: refresh });
  const removeBank = useMutation({ mutationFn: (id: number) => api("/topic-banks/" + id, { method: "DELETE" }), onSuccess: refresh });
  if (banks.isLoading) return <LoadingState />;
  if (banks.isError) return <ErrorState message={banks.error.message} retry={() => banks.refetch()} />;
  const visible = topics.data?.filter((topic) => topic.prompt.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <div className="page-enter">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="page-title">题库管理</h1><p className="mt-2 text-sm text-muted">只需填写题目，可随时向现有题库追加多道题目。</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => setAiTarget("new")}>AI 新建题库</Button><Button icon={<Layers3 className="h-4 w-4" />} onClick={() => setBankModal(true)}>新建题库</Button></div></header>
    <div className="mb-5 flex gap-2 overflow-x-auto">{banks.data?.map((item) => <button key={item.id} className={"shrink-0 rounded-xl border px-4 py-3 text-sm " + (bank?.id === item.id ? "bg-ink text-white" : "bg-white")} onClick={() => setSelectedBank(item.id)}>{item.name}<span className="ml-2 opacity-60">{item.topic_count}</span></button>)}</div>
    {!bank ? <EmptyState title="还没有题库" description="新建题库后，即可批量添加题目。" /> : <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><div className="flex items-center gap-2"><h2 className="section-title">{bank.name}</h2><button aria-label="删除题库" onClick={() => confirm("删除题库「" + bank.name + "」及其中题目？") && removeBank.mutate(bank.id)}><Trash2 className="h-4 w-4 text-muted" /></button></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setAiTarget(bank)} icon={<Sparkles className="h-4 w-4" />}>AI 追加导入</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setNotice(""); save.reset(); setTopicModal(true); }}>批量新增题目</Button></div></div>
      <div className="p-5"><input aria-label="搜索题目" className="field" placeholder="搜索题目名称" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {(remove.error || update.error || removeBank.error) && <div className="px-5 pb-4"><InlineMessage>{remove.error?.message || update.error?.message || removeBank.error?.message}</InlineMessage></div>}
      {topics.isLoading ? <LoadingState /> : topics.isError ? <ErrorState message={topics.error.message} /> : visible.length ? <div className="divide-y">{visible.map((topic) => <div key={topic.id} className={"flex items-center gap-4 p-5 " + (topic.is_active ? "" : "opacity-50")}><p className="flex-1 whitespace-pre-wrap text-sm leading-6">{topic.prompt}</p><button title={topic.is_active ? "停用" : "启用"} onClick={() => update.mutate(topic)}><Power className="h-4 w-4" /></button><button title="编辑题目" onClick={() => { setEditing(topic); setNotice(""); save.reset(); setTopicModal(true); }}><Edit3 className="h-4 w-4" /></button><button title="删除题目" onClick={() => confirm("确定删除这道题目？") && remove.mutate(topic.id)}><Trash2 className="h-4 w-4" /></button></div>)}</div> : <EmptyState title="暂无匹配的题目" description="点击批量新增或 AI 追加导入。" />}
    </section>}
    <Modal open={bankModal} onClose={() => setBankModal(false)} title="新建题库"><label className="label" htmlFor="bank-name">题库名称</label><input id="bank-name" className="field" value={bankName} onChange={(e) => setBankName(e.target.value)} />{create.error && <InlineMessage>{create.error.message}</InlineMessage>}<Button className="mt-5" disabled={bankName.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>创建题库</Button></Modal>
    <Modal open={topicModal} onClose={() => setTopicModal(false)} title={editing ? "编辑题目" : "添加到「" + bank?.name + "」"}><label className="label" htmlFor="topic-content">{editing ? "题目名称" : "题目名称，每行一道"}</label><textarea id="topic-content" className="field min-h-52" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="输入题目，也可粘贴多行内容" /><p className="mt-2 text-xs text-muted">{editing ? "只需填写题目内容。" : "当前 " + lines.length + " 道，每批最多 200 道，保存后可连续添加。"}</p>{notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}{save.error && <InlineMessage>{save.error.message}</InlineMessage>}<div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setTopicModal(false)}>完成</Button><Button disabled={!draft.trim() || (!editing && lines.length > 200)} loading={save.isPending} onClick={() => save.mutate()}>{editing ? "保存修改" : "保存并继续添加"}</Button></div></Modal>
    <AiTopicImportModal key={typeof aiTarget === "object" ? aiTarget?.id : "new"} open={!!aiTarget} targetBank={typeof aiTarget === "object" ? aiTarget : null} onClose={() => setAiTarget(null)} onImported={(item) => { setSelectedBank(item.id); void refresh(); }} />
  </div>;
}
