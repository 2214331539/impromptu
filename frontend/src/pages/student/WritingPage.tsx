import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, Save, Send } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { TaskLeaveGuard } from "../../components/common/TaskLeaveGuard";
import { useDurableDraft } from "../../hooks/useDurableDraft";
import { useEditorPosition } from "../../hooks/useEditorPosition";
import { rememberTask, forgetTask, cacheKey, readCache, writeCache, removeCache } from "../../utils/taskCache";
import { api } from "../../api/client";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import { useAntiCopyPaste, type IntegrityEvent } from "../../hooks/useAntiCopyPaste";
import { useWritingPresence } from "../../hooks/useWritingPresence";
import type { WritingAssignment, WritingRevision, WritingSubmission } from "../../types";
import { countWords, writingGrammarStatusLabel, writingSubmissionStatusLabel } from "../../utils/writing";

function submitId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function WritingPage() {
  const { submissionId } = useParams();
  return <WritingPageContent key={submissionId || "new"} />;
}

function WritingPageContent() {
  const { submissionId } = useParams();
  const id = Number(submissionId);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["writing-submission", id],
    queryFn: () => api<WritingSubmission>(`/writing/submissions/${id}`),
    enabled: Number.isFinite(id),
    refetchInterval: 15000,
  });
  const assignmentQuery = useQuery({
    queryKey: ["writing-assignment", query.data?.assignment_id],
    queryFn: () => api<WritingAssignment>(`/writing/assignments/${query.data?.assignment_id}`),
    enabled: !!query.data?.assignment_id,
    refetchInterval: 15000,
  });
  const assignmentState = assignmentQuery.data;
  const closed = !!assignmentState && (assignmentState.status !== "published" || (!assignmentState.allow_late_submission && new Date(assignmentState.due_at).getTime() < Date.now()));
  const editable = !!query.data && !!assignmentState && query.data.status !== "finalized" && !closed;
  const draft = useDurableDraft(`writing-draft:${id}`, assignmentState ? query.data?.draft_content : undefined, editable, async (content) => {
    const data = await api<WritingSubmission>(`/writing/submissions/${id}/draft`, { method: "PATCH", body: JSON.stringify({ content }) });
    client.setQueryData(["writing-submission", id], data);
  }, query.data?.status !== "finalized");
  const editorRef = useEditorPosition(`writing:${id}`, draft.content !== null);
  const submitKey = cacheKey(`writing-submit:${id}`);
  const pendingSubmit = useRef(readCache<{ content: string; id: string }>(submitKey));
  useEffect(() => {
    if (!query.data) return;
    const path = `/app/writing/session/${id}`;
    if (query.data.status === "finalized") forgetTask(path);
    else rememberTask(path, assignmentState?.title || "写作任务");
  }, [id, query.data?.status, assignmentState?.title]);

  useWritingPresence(id, Number.isFinite(id) && !!query.data);

  const reportIntegrity = useCallback(
    (event: IntegrityEvent) => {
      if (!Number.isFinite(id)) return;
      void api<void>(`/writing/submissions/${id}/integrity`, {
        method: "POST",
        body: JSON.stringify(event),
      }).catch(() => undefined);
    },
    [id],
  );
  useAntiCopyPaste(!!query.data, reportIntegrity);

  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ["writing-submission", id] });
    await client.invalidateQueries({ queryKey: ["writing-assignment", query.data?.assignment_id] });
  }, [client, id, query.data?.assignment_id]);

  const submit = useMutation({
    mutationFn: async (content: string) => {
      await draft.flush();
      if (pendingSubmit.current?.content !== content) pendingSubmit.current = { content, id: submitId() };
      writeCache(submitKey, pendingSubmit.current);
      return api<WritingSubmission>(`/writing/submissions/${id}/submit`, {
        method: "POST", body: JSON.stringify({ content, client_submit_id: pendingSubmit.current.id }),
      });
    },
    onSuccess: (data) => {
      draft.accept(data.draft_content);
      pendingSubmit.current = null;
      removeCache(submitKey);
      client.setQueryData(["writing-submission", id], data);
      void refresh();
    },
  });

  const retry = useMutation({
    mutationFn: () => api<WritingSubmission>(`/writing/submissions/${id}/retry-grammar`, { method: "POST" }),
    onSuccess: (data) => {
      client.setQueryData(["writing-submission", id], data);
      void refresh();
    },
  });

  if (query.isLoading || (query.data && assignmentQuery.isLoading)) return <LoadingState label="正在加载写作任务" />;
  if (!query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  if (!assignmentQuery.data) return <ErrorState message={assignmentQuery.error?.message} retry={() => assignmentQuery.refetch()} />;

  const submission = query.data;
  const assignment = assignmentQuery.data;
  const current = draft.content ?? submission.draft_content;
  const latestRevision = submission.revisions.at(-1);
  const readOnly = !editable || submit.isPending;
  const grammarEnabled = assignment?.grammar_hint_mode === "after_submit";
  const showGrammar = grammarEnabled && latestRevision && current === latestRevision.content && latestRevision.grammar_status !== "not_applicable";

  return <div className="page-enter mx-auto max-w-6xl">
    <TaskLeaveGuard active={submission.status !== "finalized"} scope={`writing:${id}`} writing onSave={draft.flush} />
    <Link to="/app/writing" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回写作任务</Link>
    <header className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><Badge tone={submission.status === "finalized" ? "green" : "blue"}>{writingSubmissionStatusLabel[submission.status]}</Badge><span className="text-xs text-muted">{assignment?.class_name}</span></div>
        <h1 className="mt-4 text-2xl font-semibold">{assignment?.title || "写作作业"}</h1>
        {assignment && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-6 text-muted">{assignment.instructions}</p>}
      </div>
      <div className="text-sm text-muted">{countWords(current)} 字</div>
    </header>

    <div className="mb-5">
      <InlineMessage type="info">
        本页面不允许复制、剪切、粘贴、右键和拖拽文本；系统会记录你进入、离开页面以及停留时长，供教师查看。
      </InlineMessage>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <section className="surface flex min-h-[540px] flex-col p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">写作正文</h2>
            <p className="mt-1 text-xs text-muted">系统自动保存，页面不允许复制粘贴。</p>
          </div>
          <span className={`flex items-center gap-1 text-xs ${draft.state === "error" ? "text-danger" : "text-muted"}`}><Save className="h-3.5 w-3.5" />{draft.state === "saving" ? "保存中" : draft.state === "error" ? "同步失败，本机已缓存" : draft.state === "local" ? "本机已缓存" : "已同步"}</span>
        </div>
        <textarea
          ref={editorRef}
          spellCheck={false}
          value={current}
          onChange={(event) => draft.update(event.target.value)}
          readOnly={readOnly}
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onPaste={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
          className="mt-5 min-h-[360px] flex-1 resize-none rounded-[14px] border border-black/[.08] bg-[#fafafa] p-4 text-[16px] leading-7 outline-none focus:border-accent/50 disabled:bg-black/[.03]"
          placeholder="开始写作…"
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!readOnly && <Button size="lg" icon={<Send className="h-4 w-4" />} loading={submit.isPending} disabled={countWords(current) < (assignment?.min_words || 0)} onClick={() => submit.mutate(current)}>{submission.revisions.length ? (submission.remaining_revisions > 0 ? "提交修改" : "已用尽修改次数") : "提交初稿"}</Button>}
          {readOnly && <p className="text-sm text-muted">{closed ? "任务已关闭或截止，正文已保留。" : submit.isPending ? "正在提交，请稍候。" : "写作已最终提交，不能再修改。"}</p>}
          {submission.status === "revising" && <span className="text-xs text-muted">剩余修改次数 {submission.remaining_revisions}</span>}
          {draft.error && <p className="text-sm text-danger">{draft.error}</p>}
          {submit.error && <p className="text-sm text-danger">{submit.error.message}</p>}
        </div>
      </section>

      <GrammarPanel
        revision={showGrammar ? latestRevision : null}
        grammarEnabled={grammarEnabled}
        status={submission.status}
        retry={{ isPending: retry.isPending, mutate: retry.mutate }}
      />
    </div>
  </div>;
}

function GrammarPanel({ revision, grammarEnabled, status, retry }: {
  revision: WritingRevision | null;
  grammarEnabled: boolean;
  status: WritingSubmission["status"];
  retry: { isPending: boolean; mutate: () => void };
}) {
  if (!grammarEnabled) {
    return <section className="surface p-6 text-sm text-muted"><h2 className="section-title">语法检测</h2><p className="mt-4">教师未启用语法检测。</p></section>;
  }
  if (status === "drafting") {
    return <section className="surface p-6 text-sm text-muted"><h2 className="section-title">语法检测</h2><p className="mt-4">提交初稿前不会显示语法问题。</p></section>;
  }
  if (!revision) {
    return <section className="surface p-6 text-sm text-muted"><h2 className="section-title">语法检测</h2><p className="mt-4">修改期间不显示语法问题，请再次提交后查看检测结果。</p></section>;
  }
  return <section className="surface p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="section-title">上次提交的语法检测</h2><p className="mt-1 text-xs text-muted">只标注位置和类别，不提供修改建议。</p></div>
      <Badge tone={revision.grammar_status === "completed" ? "green" : revision.grammar_status === "failed" ? "orange" : "neutral"}>{writingGrammarStatusLabel[revision.grammar_status]}</Badge>
    </div>
    {revision.grammar_status === "failed" && <div className="mt-4"><InlineMessage>本次检测暂时不可用，但提交已保存。</InlineMessage><Button className="mt-3" size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={retry.isPending} onClick={() => retry.mutate()}>重新检测</Button></div>}
    {revision.grammar_status === "completed" && <div className="mt-5"><HighlightedContent content={revision.content} issues={revision.issues} /><div className="mt-5 space-y-2">{revision.issues.map((issue) => <div key={issue.id} className="rounded-[11px] border border-black/[.07] bg-white p-3 text-sm"><span className="font-medium">{issue.message}</span><span className="ml-2 text-xs text-muted">第 {issue.start_offset}-{issue.end_offset} 字符</span></div>)}</div></div>}
  </section>;
}

function HighlightedContent({ content, issues }: { content: string; issues: WritingRevision["issues"] }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  issues.forEach((issue, index) => {
    if (issue.start_offset < cursor || issue.start_offset >= content.length) return;
    if (issue.start_offset > cursor) nodes.push(content.slice(cursor, issue.start_offset));
    const end = Math.min(issue.end_offset, content.length);
    nodes.push(<mark key={index} className="rounded bg-yellow-100 px-0.5 text-inherit">{content.slice(issue.start_offset, end)}</mark>);
    cursor = end;
  });
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return <div className="whitespace-pre-wrap rounded-[12px] border border-black/[.06] bg-[#fafafa] p-4 text-[15px] leading-7">{nodes.length ? nodes : content}</div>;
}
