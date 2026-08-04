import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, ChevronRight, Dices, Mic2, RefreshCw, Save, Send, ShieldCheck, SkipForward, Square, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { AudioDownloadButton, AudioPlayer } from "../../components/common/AudioPlayer";
import { Badge } from "../../components/common/Badge";
import { Button } from "../../components/common/Button";
import { ErrorState, InlineMessage, LoadingState } from "../../components/common/States";
import { MicCheckStage } from "../../components/recorder/MicCheckStage";
import { CountdownRing } from "../../components/timer/CountdownRing";
import { useCountdown, playTimerTone } from "../../hooks/useCountdown";
import { useRecorder } from "../../hooks/useRecorder";
import { useTrainingStore } from "../../stores/training";
import type { Draw, Recording, TrainingSession } from "../../types";
import { difficultyLabel, formatDuration } from "../../utils/format";

type Recorder = ReturnType<typeof useRecorder>;

export function TrainingPage() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const client = useQueryClient();
  const recorder = useRecorder();
  const [localAudio, setLocalAudio] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<{ blob: Blob; duration: number } | null>(null);
  const query = useQuery({ queryKey: ["session", id], queryFn: () => api<TrainingSession>(`/sessions/${id}`), enabled: Number.isFinite(id), refetchInterval: (q) => ["researching", "preparing"].includes(q.state.data?.phase || "") ? 5000 : false });
  const refresh = useCallback(async () => { await client.invalidateQueries({ queryKey: ["session", id] }); await client.invalidateQueries({ queryKey: ["tasks"] }); }, [client, id]);
  const upload = useMutation({
    mutationFn: async (payload: { blob: Blob; duration: number }) => {
      const form = new FormData();
      const extension = payload.blob.type.includes("mp4") ? "mp4" : payload.blob.type.includes("ogg") ? "ogg" : "webm";
      form.append("file", payload.blob, `speaking-attempt.${extension}`);
      form.append("duration_seconds", String(payload.duration));
      return api<Recording>(`/sessions/${id}/recordings`, { method: "POST", body: form });
    },
    onSuccess: () => { setPendingBlob(null); void refresh(); },
  });
  const finish = useMutation({ mutationFn: () => api<TrainingSession>(`/sessions/${id}/finish-speaking`, { method: "POST" }) });
  const finishAndUpload = useCallback(async () => {
    if (!recorder.recording) { await finish.mutateAsync(); await refresh(); return; }
    try {
      const result = await recorder.stop();
      setPendingBlob(result);
      setLocalAudio((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(result.blob); });
      await finish.mutateAsync();
      await upload.mutateAsync(result);
      await refresh();
    } catch { await refresh(); }
  }, [finish, recorder, refresh, upload]);
  useEffect(() => () => { if (localAudio) URL.revokeObjectURL(localAudio); }, [localAudio]);
  if (query.isLoading) return <LoadingState label="正在恢复训练状态" />;
  if (query.isError || !query.data) return <ErrorState message={query.error?.message} retry={() => query.refetch()} />;
  const session = query.data;
  return <div className="page-enter mx-auto max-w-5xl">
    <TrainingSteps phase={session.phase} />
    {session.phase === "mic_check" && <MicCheckStage session={session} recorder={recorder} onRefresh={refresh} />}
    {session.phase === "drawing" && <DrawStage session={session} onRefresh={refresh} />}
    {session.phase === "researching" && <ResearchStage session={session} onRefresh={refresh} />}
    {session.phase === "preparing" && <PreparationStage session={session} recorder={recorder} onRefresh={refresh} />}
    {session.phase === "speaking" && <SpeakingStage session={session} recorder={recorder} onFinish={finishAndUpload} onRefresh={refresh} />}
    {session.phase === "review" && <ReviewStage session={session} localAudio={localAudio} pendingBlob={pendingBlob} upload={upload} recorder={recorder} onRefresh={refresh} />}
    {session.phase === "submitted" && <SubmittedStage session={session} />}
  </div>;
}

function TrainingSteps({ phase }: { phase: TrainingSession["phase"] }) {
  const phases = ["mic_check", "drawing", "researching", "preparing", "speaking", "review"] as const;
  const current = phase === "submitted" ? phases.length - 1 : Math.max(0, phases.indexOf(phase));
  return <div className="mb-7 overflow-x-auto pb-1"><div className="mx-auto flex min-w-max items-center justify-center gap-1.5 px-2 sm:gap-3">{["试音", "选题", "搜集", "整理", "演讲", "提交"].map((label, index) => <div key={label} className="flex items-center gap-1.5 sm:gap-3"><span className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-[12px] font-medium ${index <= current ? "bg-ink text-white" : "bg-black/[.05] text-muted"}`}>{index < current ? <Check className="h-3.5 w-3.5" /> : label}</span>{index < phases.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-black/20" />}</div>)}</div></div>;
}

function DrawStage({ session, onRefresh }: { session: TrainingSession; onRefresh: () => Promise<void> }) {
  const [revealing, setRevealing] = useState(false);
  const draw = useMutation({ mutationFn: () => api<Draw>(`/sessions/${session.id}/draw`, { method: "POST" }), onMutate: () => setRevealing(true), onSettled: async () => { window.setTimeout(() => setRevealing(false), 450); await onRefresh(); } });
  const confirm = useMutation({ mutationFn: () => api<TrainingSession>(`/sessions/${session.id}/confirm-topic`, { method: "POST" }), onSuccess: onRefresh });
  const topic = session.current_draw?.topic;
  return <section className="surface overflow-hidden text-center"><div className="border-b border-black/[.06] px-6 py-7"><p className="text-sm font-medium text-accent">随机抽题</p><h1 className="mt-2 text-2xl font-semibold">让题目决定这一刻的表达</h1><p className="mt-2 text-sm text-muted">确认后进入 {formatDuration(session.task.research_seconds)} 资料搜集时间。</p></div><div className="p-6 sm:p-10"><div className={`mx-auto flex min-h-[300px] max-w-2xl flex-col items-center justify-center rounded-[20px] border border-black/[.08] bg-[#fafafa] px-6 py-10 ${topic && !revealing ? "draw-reveal" : ""}`}>{revealing ? <><Dices className="h-9 w-9 animate-pulse text-accent" /><p className="mt-5 text-sm text-muted">正在从题库中抽取…</p></> : topic ? <><div className="flex items-center gap-2"><Badge tone="blue">{topic.category}</Badge><Badge>{difficultyLabel[topic.difficulty]}</Badge></div><p className="mt-7 max-w-xl text-[25px] font-medium leading-[1.5] sm:text-[30px]">{topic.prompt}</p></> : <><span className="grid h-14 w-14 place-items-center rounded-full bg-black/[.04]"><Dices className="h-6 w-6 text-muted" /></span><p className="mt-5 text-base font-medium">题目仍在题库里</p><p className="mt-2 text-sm text-muted">点击下方按钮进行第一次抽取。</p></>}</div>{(draw.error || confirm.error) && <p className="mx-auto mt-4 max-w-xl text-sm text-danger">{draw.error?.message || confirm.error?.message}</p>}<div className="mt-6 flex flex-wrap justify-center gap-3">{!topic ? <Button size="lg" icon={<Dices className="h-4 w-4" />} loading={draw.isPending} onClick={() => draw.mutate()}>随机抽取</Button> : <><Button variant="secondary" size="lg" icon={<RefreshCw className="h-4 w-4" />} disabled={session.current_draw?.redraws_remaining === 0} loading={draw.isPending} onClick={() => draw.mutate()}>重新抽取 {session.current_draw?.redraws_remaining ? `(${session.current_draw.redraws_remaining})` : ""}</Button><Button size="lg" icon={<Check className="h-4 w-4" />} loading={confirm.isPending} onClick={() => confirm.mutate()}>确认题目</Button></>}</div></div></section>;
}

function ResearchStage({ session, onRefresh }: { session: TrainingSession; onRefresh: () => Promise<void> }) {
  const expire = useCallback(() => { playTimerTone(); void onRefresh(); }, [onRefresh]);
  const remaining = useCountdown(session.research_ends_at, session.server_time, expire);
  const finish = useMutation({ mutationFn: () => api<TrainingSession>(`/sessions/${session.id}/start-preparation`, { method: "POST" }), onSuccess: onRefresh });
  return <section className="surface mx-auto max-w-3xl overflow-hidden"><div className="border-b border-black/[.06] px-6 py-6 text-center sm:px-8"><Badge tone="blue">资料搜集</Badge><h1 className="mx-auto mt-4 max-w-2xl text-xl font-semibold leading-8">{session.final_topic?.prompt}</h1></div><div className="p-7 text-center sm:p-10"><span className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-accent"><BookOpen className="h-5 w-5" /></span><CountdownRing remaining={remaining} total={session.task.research_seconds} label="搜集剩余" /><p className="mx-auto mt-7 max-w-lg text-sm leading-7 text-muted">利用这段时间查找事实、案例和相关表达。倒计时结束后将自动进入 {formatDuration(session.task.preparation_seconds)} 草稿整理阶段。</p><Button className="mt-6" variant="secondary" icon={<SkipForward className="h-4 w-4" />} loading={finish.isPending} onClick={() => finish.mutate()}>提前结束搜集</Button>{finish.error && <p className="mt-3 text-sm text-danger">{finish.error.message}</p>}</div></section>;
}

function PreparationStage({ session, recorder, onRefresh }: { session: TrainingSession; recorder: Recorder; onRefresh: () => Promise<void> }) {
  const draft = useTrainingStore((s) => s.noteDrafts[session.id]);
  const setDraft = useTrainingStore((s) => s.setNoteDraft);
  const initialized = useRef(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const start = useMutation({ mutationFn: async () => { const content = draft ?? session.note; if (content !== session.note) await api<TrainingSession>(`/sessions/${session.id}/note`, { method: "PATCH", body: JSON.stringify({ content }) }); const deviceId = recorder.selectedDeviceId || undefined; await recorder.start(deviceId); try { return await api<TrainingSession>(`/sessions/${session.id}/start-speaking`, { method: "POST" }); } catch (error) { await recorder.stop().catch(() => undefined); throw error; } }, onSuccess: onRefresh });
  const save = useMutation({ mutationFn: (content: string) => api<TrainingSession>(`/sessions/${session.id}/note`, { method: "PATCH", body: JSON.stringify({ content }) }), onMutate: () => setSaveState("saving"), onSuccess: () => setSaveState("saved"), onError: () => setSaveState("error") });
  useEffect(() => { if (!initialized.current) { setDraft(session.id, session.note); initialized.current = true; } }, [session.id, session.note, setDraft]);
  useEffect(() => { if (draft === undefined || draft === session.note) return; const timer = window.setTimeout(() => save.mutate(draft), 1200); return () => window.clearTimeout(timer); }, [draft, session.note]);
  const onExpire = useCallback(() => { playTimerTone(); }, []);
  const remaining = useCountdown(session.preparation_ends_at, session.server_time, onExpire);
  const waitingForCountdown = !session.task.allow_early_finish && remaining > 0;
  return <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><div className="surface flex flex-col p-5 sm:p-8"><div><Badge tone="blue">准备整理</Badge><h1 className="mt-4 break-words text-xl font-semibold leading-8">{session.final_topic?.prompt}</h1></div><div className="my-auto py-6 sm:py-7"><CountdownRing remaining={remaining} total={session.task.preparation_seconds} label={remaining > 0 ? "整理剩余" : "整理完成"} /></div><div className="text-center"><Button size="lg" icon={<Mic2 className="h-4 w-4" />} disabled={waitingForCountdown} loading={start.isPending} onClick={() => start.mutate()}>开始演讲并录音</Button><p className="mt-3 text-xs text-muted">整理结束后不会自动计入演讲时间，请主动开始。</p></div>{start.error && <p className="mt-3 text-center text-sm text-danger">{start.error.message}</p>}</div><div className="surface flex min-h-[420px] flex-col p-5 sm:min-h-[540px] sm:p-8"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="section-title">演讲草稿</h2><p className="mt-1 text-sm text-muted">整理演讲结构和提示词，正式演讲时仍会显示。</p></div><span className={`flex items-center gap-1 text-xs ${saveState === "error" ? "text-danger" : "text-muted"}`}><Save className="h-3.5 w-3.5" />{saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "已保存"}</span></div><textarea value={draft ?? session.note} onChange={(event) => setDraft(session.id, event.target.value)} className="mt-5 min-h-[280px] flex-1 resize-none rounded-[14px] border border-black/[.08] bg-[#fafafa] p-4 text-[16px] leading-7 outline-none focus:border-accent/50 sm:min-h-[390px] sm:text-[15px]" placeholder="开场…\n观点与论据…\n案例…\n结尾…" /></div></section>;
}

function SpeakingStage({ session, recorder, onFinish, onRefresh }: { session: TrainingSession; recorder: Recorder; onFinish: () => Promise<void>; onRefresh: () => Promise<void> }) {
  const begin = useMutation({ mutationFn: async () => { await recorder.prepare(); await api<TrainingSession>(`/sessions/${session.id}/start-speaking`, { method: "POST" }); await recorder.start(); }, onSuccess: onRefresh });
  const finishGuard = useRef(false);
  const expire = useCallback(() => { if (!finishGuard.current) { finishGuard.current = true; playTimerTone(); void onFinish(); } }, [onFinish]);
  const remaining = useCountdown(session.speaking_ends_at, session.server_time, expire);
  return <section className="grid gap-5 lg:grid-cols-[1fr_.85fr]"><div className="surface overflow-hidden"><div className="border-b border-black/[.06] px-6 py-5 text-center"><Badge tone="red">正式演讲</Badge><h1 className="mx-auto mt-3 max-w-2xl text-lg font-semibold leading-7">{session.final_topic?.prompt}</h1></div><div className="p-7 text-center sm:p-10"><CountdownRing remaining={remaining} total={session.task.speaking_seconds} label="演讲剩余" /><div className="mx-auto mt-5 max-w-md"><div className="flex h-12 items-center gap-1 rounded-[12px] bg-black/[.035] px-4" aria-label="实时音量">{Array.from({ length: 24 }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full transition-all duration-100 ${i / 24 < recorder.volume ? "bg-accent" : "bg-black/10"}`} style={{ transform: `scaleY(${i / 24 < recorder.volume ? 1 + recorder.volume * 4 : 1})` }} />)}</div><p className={`mt-3 flex items-center justify-center gap-2 text-sm ${recorder.recording ? "text-danger" : "text-muted"}`}><span className={`h-2 w-2 rounded-full ${recorder.recording ? "animate-pulse bg-danger" : "bg-black/20"}`} />{recorder.recording ? "正在录音" : recorder.permission === "denied" ? "麦克风授权失败" : "等待恢复录音"}</p></div>{begin.error && <InlineMessage>{begin.error.message}</InlineMessage>}<div className="mt-6 flex justify-center">{recorder.recording ? <Button variant="danger" size="lg" icon={<Square className="h-4 w-4 fill-current" />} onClick={() => void onFinish()}>结束演讲</Button> : <Button size="lg" icon={<Mic2 className="h-4 w-4" />} loading={begin.isPending} onClick={() => begin.mutate()}>恢复录音</Button>}</div><p className="mt-4 text-xs text-muted">倒计时结束时，录音会自动停止。</p></div></div><aside className="surface flex min-h-[420px] flex-col p-6 sm:p-8"><div><h2 className="section-title">演讲草稿</h2><p className="mt-1 text-sm text-muted">准备阶段保存的内容，仅供演讲时提示。</p></div><div className="mt-5 flex-1 whitespace-pre-wrap rounded-[14px] border border-black/[.07] bg-[#fafafa] p-4 text-[15px] leading-7 text-ink">{session.note || <span className="text-muted">准备阶段未填写草稿。</span>}</div></aside></section>;
}

function ReviewStage({ session, localAudio, pendingBlob, upload, recorder, onRefresh }: { session: TrainingSession; localAudio: string | null; pendingBlob: { blob: Blob; duration: number } | null; upload: ReturnType<typeof useMutation<Recording, Error, { blob: Blob; duration: number }>>; recorder: Recorder; onRefresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const recording = session.recordings.find((x) => x.is_selected) || session.recordings.at(-1);
  const retry = useMutation({ mutationFn: async () => { const deviceId = recorder.selectedDeviceId || undefined; await recorder.prepare(deviceId); const result = await api<TrainingSession>(`/sessions/${session.id}/retry-speaking`, { method: "POST" }); await recorder.start(deviceId); return result; }, onSuccess: onRefresh });
  const submit = useMutation({ mutationFn: () => api<TrainingSession>(`/sessions/${session.id}/submit`, { method: "POST", body: JSON.stringify({ recording_id: recording?.id }) }), onSuccess: async () => { await onRefresh(); navigate(`/app/history/${session.id}`); } });
  const source = localAudio || recording?.stream_url || null;
  const speakingSeconds = session.speaking_started_at && session.speaking_finished_at ? Math.max(0, (new Date(session.speaking_finished_at).getTime() - new Date(session.speaking_started_at).getTime()) / 1000) : 0;
  return <section className="surface overflow-hidden"><div className="border-b border-black/[.06] p-6 sm:p-8"><Badge tone="green">训练完成</Badge><h1 className="mt-4 text-2xl font-semibold">检查并提交录音</h1><p className="mt-2 text-sm text-muted">确认录音可以正常播放后提交。</p></div><div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[.9fr_1.1fr]"><div><h2 className="text-sm font-semibold">本次题目</h2><p className="mt-3 text-lg font-medium leading-8">{session.final_topic?.prompt}</p><div className="mt-5 flex gap-5 text-xs text-muted"><span>准备 {formatDuration(session.task.preparation_seconds)}</span><span>表达 {formatDuration(speakingSeconds)}</span></div><h2 className="mt-8 text-sm font-semibold">演讲录音</h2>{source ? <AudioPlayer className="mt-3" src={source} durationHint={pendingBlob?.duration || recording?.duration_seconds || speakingSeconds} /> : <div className="mt-3 rounded-[12px] bg-orange-50 p-4 text-sm text-warning">录音尚未上传。</div>}{recording && <AudioDownloadButton className="mt-3" src={recording.download_url} filename={`speaking-${recording.id}.mp4`} />}{upload.isPending && <p className="mt-3 flex items-center gap-2 text-xs text-muted"><UploadCloud className="h-3.5 w-3.5 animate-pulse" />正在上传录音</p>}{upload.error && <div className="mt-3"><InlineMessage>{upload.error.message}</InlineMessage>{pendingBlob && <Button className="mt-2" size="sm" variant="secondary" onClick={() => upload.mutate(pendingBlob)}>重新上传</Button>}</div>}<Button className="mt-5" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} disabled={session.rerecords_remaining <= 0} loading={retry.isPending} onClick={() => retry.mutate()}>重新录制 {session.rerecords_remaining > 0 ? `(${session.rerecords_remaining})` : ""}</Button>{retry.error && <p className="mt-2 text-sm text-danger">{retry.error.message}</p>}</div><div className="flex flex-col justify-end">{submit.error && <div className="mb-3"><InlineMessage>{submit.error.message}</InlineMessage></div>}<Button className="w-full" size="lg" icon={<Send className="h-4 w-4" />} disabled={!recording || upload.isPending} loading={submit.isPending} onClick={() => submit.mutate()}>提交演讲录音</Button></div></div></section>;
}

function SubmittedStage({ session }: { session: TrainingSession }) {
  const navigate = useNavigate();
  return <section className="surface mx-auto max-w-2xl p-8 text-center sm:p-12"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-50 text-success"><ShieldCheck className="h-6 w-6" /></span><h1 className="mt-5 text-2xl font-semibold">录音已经提交</h1><p className="mt-3 text-sm leading-6 text-muted">录音已安全保存。教师发布评价后，你可以在训练记录中查看。</p><Button className="mt-7" onClick={() => navigate(`/app/history/${session.id}`)}>查看训练记录</Button></section>;
}
