import { useMutation } from "@tanstack/react-query";
import { Check, Mic2, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { RecordingResult } from "../../hooks/useRecorder";
import { isVirtualAudioDevice, useRecorder } from "../../hooks/useRecorder";
import type { TrainingSession } from "../../types";
import { AudioPlayer } from "../common/AudioPlayer";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";

type Recorder = ReturnType<typeof useRecorder>;
type TrialState = "idle" | "recording" | "review" | "error";

const TRIAL_SECONDS = 10;

interface Props {
  session: TrainingSession;
  recorder: Recorder;
  onRefresh: () => Promise<void>;
}

export function MicCheckStage({ session, recorder, onRefresh }: Props) {
  const [state, setState] = useState<TrialState>("idle");
  const [remaining, setRemaining] = useState(TRIAL_SECONDS);
  const [trialUrl, setTrialUrl] = useState<string | null>(null);
  const [trialDuration, setTrialDuration] = useState(0);
  const [playable, setPlayable] = useState(false);
  const [signalDetected, setSignalDetected] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const signalDetectedRef = useRef(false);
  const signalStartedAtRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  const completeMicCheck = useMutation({
    mutationFn: () => api<TrainingSession>(`/sessions/${session.id}/complete-mic-check`, { method: "POST" }),
    onSuccess: onRefresh,
  });

  const replaceUrl = useCallback((result: RecordingResult | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const next = result ? URL.createObjectURL(result.blob) : null;
    urlRef.current = next;
    setTrialUrl(next);
    setTrialDuration(result?.duration || 0);
  }, []);

  const finishTrial = useCallback(async () => {
    if (stoppingRef.current || !recorder.recording) return;
    stoppingRef.current = true;
    try {
      const result = await recorder.stop();
      if (result.duration < 0.5 || result.blob.size < 256) throw new Error("录音时间太短，请重新试音");
      if (!signalDetectedRef.current) throw new Error("没有检测到麦克风声音，请检查系统输入设备后重新试音");
      replaceUrl(result);
      setPlayable(false);
      setMessage(null);
      setState("review");
    } catch (error) {
      replaceUrl(null);
      setMessage(error instanceof Error ? error.message : "试音失败，请重新试音");
      setState("error");
    } finally {
      stoppingRef.current = false;
    }
  }, [recorder, replaceUrl]);

  const beginTrial = useCallback(async () => {
    replaceUrl(null);
    setPlayable(false);
    setSignalDetected(false);
    signalDetectedRef.current = false;
    signalStartedAtRef.current = 0;
    setMessage(null);
    setRemaining(TRIAL_SECONDS);
    setState("idle");
    try {
      await recorder.start();
      startedAtRef.current = performance.now();
      setState("recording");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法启动麦克风，请检查浏览器权限");
      setState("error");
    }
  }, [recorder, replaceUrl]);

  useEffect(() => {
    if (state !== "recording") return;
    const update = () => {
      const elapsed = (performance.now() - startedAtRef.current) / 1000;
      const next = Math.max(0, Math.ceil(TRIAL_SECONDS - elapsed));
      setRemaining(next);
      if (next === 0) void finishTrial();
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [finishTrial, state]);

  useEffect(() => {
    if (state !== "recording" || signalDetectedRef.current) return;
    if (recorder.volume < 0.08) {
      signalStartedAtRef.current = 0;
      return;
    }
    if (!signalStartedAtRef.current) signalStartedAtRef.current = performance.now();
    if (performance.now() - signalStartedAtRef.current >= 300) {
      signalDetectedRef.current = true;
      setSignalDetected(true);
    }
  }, [recorder.volume, state]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const progress = ((TRIAL_SECONDS - remaining) / TRIAL_SECONDS) * 100;

  return (
    <section className="surface mx-auto max-w-2xl overflow-hidden">
      <div className="border-b border-black/[.06] px-7 py-7 text-center sm:px-10">
        <Badge tone="blue">开始前试音</Badge>
        <h1 className="mt-4 text-2xl font-semibold">确认麦克风声音清晰</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-muted">录制一段最长 10 秒的声音并回放。确认收音正常后，再进入随机选题。</p>
      </div>

      <div className="p-7 text-center sm:p-10">
        {state === "recording" ? (
          <div className="mx-auto max-w-md">
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-red-200 bg-red-50/60">
              <div><p className="text-3xl font-semibold tabular-nums text-danger">00:{String(remaining).padStart(2, "0")}</p><p className="mt-1 text-xs text-muted">剩余试音时间</p></div>
            </div>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-black/[.06]"><div className="h-full bg-danger transition-[width] duration-100" style={{ width: `${progress}%` }} /></div>
            <div className="mt-6 flex h-12 items-center gap-1 rounded-[12px] bg-black/[.035] px-4" aria-label="实时音量">
              {Array.from({ length: 24 }, (_, index) => <span key={index} className={`h-1 flex-1 rounded-full transition-all duration-100 ${index / 24 < recorder.volume ? "bg-accent" : "bg-black/10"}`} style={{ transform: `scaleY(${index / 24 < recorder.volume ? 1 + recorder.volume * 4 : 1})` }} />)}
            </div>
            <p className={`mt-3 text-xs ${recorder.inputMuted || !signalDetected ? "text-warning" : "text-success"}`}>{recorder.inputMuted ? "麦克风输入已被系统静音" : signalDetected ? `已检测到声音 · ${recorder.deviceLabel}` : `正在等待声音 · ${recorder.deviceLabel}`}</p>
            <Button className="mt-6 w-full" size="lg" variant="danger" icon={<Square className="h-4 w-4 fill-current" />} onClick={() => void finishTrial()}>结束试音</Button>
          </div>
        ) : (
          <div className="mx-auto max-w-md">
            {state === "idle" && <p className="mb-4 text-xs text-muted">开始后将使用：{recorder.deviceLabel}</p>}
            {trialUrl && state === "review" && <div className="text-left"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><Check className="h-4 w-4 text-success" />试音录制完成</div><AudioPlayer key={trialUrl} src={trialUrl} durationHint={trialDuration} onReady={() => setPlayable(true)} onError={() => { setPlayable(false); setMessage("录音无法播放，请重新试音"); }} /></div>}
            {message && <p className="rounded-[12px] bg-red-50 px-4 py-3 text-sm text-danger">{message}</p>}
            {recorder.devices.length > 1 && <label className="mt-5 block text-left text-xs text-muted"><span>输入设备</span><select className="mt-2 h-11 w-full rounded-[11px] border border-black/10 bg-white px-3 text-sm text-ink outline-none focus:border-accent/50" value={recorder.selectedDeviceId} disabled={recorder.permission === "requesting"} onChange={(event) => { setMessage(null); void recorder.selectDevice(event.target.value).catch((error) => setMessage(error instanceof Error ? error.message : "无法切换麦克风")); }}>{recorder.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label ? `${device.label}${isVirtualAudioDevice(device.label) ? "（虚拟设备）" : ""}` : `麦克风 ${index + 1}`}</option>)}</select></label>}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button size="lg" variant={state === "idle" ? "primary" : "secondary"} icon={state === "idle" ? <Mic2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} loading={recorder.permission === "requesting"} onClick={() => void beginTrial()}>{state === "idle" ? "开始试音" : "重新试音"}</Button>
              <Button size="lg" disabled={!playable || state !== "review"} loading={completeMicCheck.isPending} onClick={() => completeMicCheck.mutate()}>声音正常，进入选题</Button>
            </div>
            <p className="mt-4 text-xs text-muted">每次开始或重新试音都会从 10 秒重新计时。</p>
          </div>
        )}
        {completeMicCheck.error && <p className="mt-4 text-sm text-danger">{completeMicCheck.error.message}</p>}
      </div>
    </section>
  );
}
