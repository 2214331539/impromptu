import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { useCachedState } from "../../hooks/useCachedState";
import { cacheKey, readCache, rememberTask, forgetTask } from "../../utils/taskCache";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Button } from "../../components/common/Button";
import { ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import type { ClassRoom, WritingAssignment, WritingGrammarHintMode } from "../../types";

function localDate(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function WritingAssignmentCreatePage() {
  const { assignmentId } = useParams();
  return <WritingAssignmentCreatePageContent key={assignmentId || "new"} />;
}

function WritingAssignmentCreatePageContent() {
  const navigate = useNavigate();
  const { assignmentId } = useParams();
  const client = useQueryClient();
  const path = assignmentId ? `/teacher/writing/${assignmentId}/edit` : "/teacher/writing/new";
  const scope = `writing-form:${assignmentId || "new"}`;
  const loaded = useRef(false);
  const existing = useQuery({ queryKey: ["writing-assignment", assignmentId], queryFn: () => api<WritingAssignment>(`/writing/assignments/${assignmentId}`), enabled: !!assignmentId });
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<ClassRoom[]>("/classes") });
  const [form, setForm, clearForm] = useCachedState(scope, { title: "", instructions: "", classId: 0, startsAt: localDate(0), dueAt: localDate(7), minWords: 50, maxWords: "", grammarHintMode: "after_submit" as WritingGrammarHintMode, revisionLimit: 1, allowLate: false });
  const { title, instructions, classId, startsAt, dueAt, minWords, maxWords, grammarHintMode, revisionLimit, allowLate } = form;
  function field<K extends keyof typeof form>(name: K, value: typeof form[K]) { setForm((old) => ({ ...old, [name]: value })); rememberTask(path, title || "写作任务编辑草稿"); }
  useEffect(() => {
    if (loaded.current || (assignmentId && !existing.data)) return;
    loaded.current = true;
    if (readCache(cacheKey(scope)) || !existing.data) return;
    const item = existing.data;
    const local = (value: string) => { const d = new Date(value); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    setForm({ title: item.title, instructions: item.instructions, classId: item.class_id, startsAt: local(item.starts_at), dueAt: local(item.due_at), minWords: item.min_words, maxWords: item.max_words?.toString() ?? "", grammarHintMode: item.grammar_hint_mode, revisionLimit: item.revision_limit, allowLate: item.allow_late_submission });
  }, [existing.data, assignmentId, scope]);
  const create = useMutation({
    mutationFn: () =>
      api<WritingAssignment>(assignmentId ? `/writing/assignments/${assignmentId}` : "/writing/assignments", {
        method: assignmentId ? "PUT" : "POST",
        body: JSON.stringify({
          title,
          instructions,
          class_id: classId,
          starts_at: new Date(startsAt).toISOString(),
          due_at: new Date(dueAt).toISOString(),
          min_words: minWords,
          max_words: maxWords ? Number(maxWords) : null,
          grammar_hint_mode: grammarHintMode,
          revision_limit: revisionLimit,
          allow_late_submission: allowLate,
        }),
      }),
    onSuccess: async () => { clearForm(); forgetTask(path); await Promise.all([client.invalidateQueries({ queryKey: ["writing-assignments"] }), client.invalidateQueries({ queryKey: ["writing-assignment"] }), client.invalidateQueries({ queryKey: ["dashboard"] })]); navigate("/teacher/writing"); },
  });
  if (classes.isLoading || (assignmentId && existing.isLoading)) return <LoadingState />;
  if (classes.isError || existing.isError) return <ErrorState message={classes.error?.message || existing.error?.message} retry={() => classes.refetch()} />;
  return <div className="page-enter mx-auto max-w-4xl">
    <Link to="/teacher/writing" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回写作任务</Link>
    <header className="mb-7"><h1 className="page-title">{assignmentId ? "编辑写作任务" : "创建写作任务"}</h1><p className="mt-2 text-sm text-muted">设置写作要求、语法检测策略和修改机会。表单自动缓存；已有正式提交后，检测策略与修改次数不可更改。</p></header>
    <form className="surface overflow-hidden" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
      <section className="border-b border-black/[.06] p-6 sm:p-8">
        <h2 className="section-title">基本信息</h2>
        <div className="mt-5 space-y-4">
          <Field label="任务标题"><input className="field" value={title} onChange={(event) => field("title", event.target.value)} /></Field>
          <Field label="写作要求"><textarea className="field min-h-28 resize-none leading-6" value={instructions} onChange={(event) => field("instructions", event.target.value)} /></Field>
          <Field label="目标班级"><select className="field" value={classId} onChange={(event) => field("classId", Number(event.target.value))}><option value={0}>请选择</option>{classes.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        </div>
      </section>
      <section className="border-b border-black/[.06] p-6 sm:p-8">
        <h2 className="section-title">时间与字数</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="开始时间"><input type="datetime-local" className="field" value={startsAt} onChange={(event) => field("startsAt", event.target.value)} /></Field>
          <Field label="截止时间"><input type="datetime-local" className="field" value={dueAt} onChange={(event) => field("dueAt", event.target.value)} /></Field>
          <Field label="最少字数"><input type="number" className="field" value={minWords} onChange={(event) => field("minWords", Number(event.target.value))} /></Field>
          <Field label="最多字数"><input type="number" className="field" value={maxWords} onChange={(event) => field("maxWords", event.target.value)} placeholder="留空不限" /></Field>
        </div>
      </section>
      <section className="p-6 sm:p-8">
        <h2 className="section-title">检测与提交规则</h2>
        <div className="mt-5 space-y-4">
          <Field label="语法检测策略"><select className="field" value={grammarHintMode} onChange={(event) => field("grammarHintMode", event.target.value as WritingGrammarHintMode)}><option value="off">关闭</option><option value="after_submit">首次提交后检测</option></select></Field>
          <Field label="首次提交后修改次数"><input type="number" className="field" min={0} value={revisionLimit} onChange={(event) => field("revisionLimit", Number(event.target.value))} /></Field>
          <label className="flex cursor-pointer items-center justify-between rounded-[12px] border border-black/[.07] bg-white p-3.5 text-sm"><span>允许截止后补交</span><input type="checkbox" className="h-4 w-4 accent-accent" checked={allowLate} onChange={(event) => field("allowLate", event.target.checked)} /></label>
        </div>
        {create.error && <div className="mt-5"><InlineMessage>{create.error.message}</InlineMessage></div>}
        <div className="mt-7 flex justify-end gap-2"><Link to="/teacher/writing"><Button type="button" variant="ghost">取消</Button></Link><Button type="submit" loading={create.isPending} icon={<Send className="h-4 w-4" />} disabled={!title.trim() || !classId || new Date(dueAt) <= new Date(startsAt)}>{assignmentId ? "保存修改" : "创建为草稿"}</Button></div>
      </section>
    </form>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}
