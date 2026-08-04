import { useCallback, useEffect, useRef, useState } from "react";

export type PermissionState = "idle" | "requesting" | "granted" | "denied" | "unsupported";

export interface RecordingResult {
  blob: Blob;
  duration: number;
}

const PREFERRED_DEVICE_KEY = "speaking-lab-audio-input";

function storedDeviceId(): string {
  try {
    return localStorage.getItem(PREFERRED_DEVICE_KEY) || "";
  } catch {
    return "";
  }
}

function rememberDevice(deviceId: string): void {
  try {
    if (deviceId) localStorage.setItem(PREFERRED_DEVICE_KEY, deviceId);
    else localStorage.removeItem(PREFERRED_DEVICE_KEY);
  } catch {
    // Storage can be unavailable in private browsing; the active stream still works.
  }
}

export function useRecorder() {
  const [permission, setPermission] = useState<PermissionState>("idle");
  const [recording, setRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const [inputMuted, setInputMuted] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("默认麦克风");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(storedDeviceId);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserFrameRef = useRef(0);
  const startedAtRef = useRef(0);
  const preferredDeviceIdRef = useRef(selectedDeviceId);

  const releaseAudio = useCallback(() => {
    cancelAnimationFrame(analyserFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => {
      track.onmute = null;
      track.onunmute = null;
      track.onended = null;
      track.stop();
    });
    sourceNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    if (audioContextRef.current?.state !== "closed") void audioContextRef.current?.close();
    streamRef.current = null;
    sourceNodeRef.current = null;
    analyserRef.current = null;
    silentGainRef.current = null;
    audioContextRef.current = null;
    setVolume(0);
  }, []);

  const prepare = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setPermission("unsupported");
      throw new Error("当前浏览器不支持录音");
    }

    const targetDeviceId = deviceId || preferredDeviceIdRef.current || undefined;
    const currentTrack = streamRef.current?.getAudioTracks()[0];
    const currentDeviceId = currentTrack?.getSettings().deviceId || "";
    if (streamRef.current?.active && (!targetDeviceId || targetDeviceId === currentDeviceId)) {
      if (audioContextRef.current?.state === "suspended") await audioContextRef.current.resume();
      return streamRef.current;
    }

    releaseAudio();
    setPermission("requesting");
    try {
      // Create and resume this synchronously from the click path. Recording itself
      // uses the raw stream, so a later AudioContext suspension cannot mute it.
      const context = new AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = context;
      await context.resume();

      const audioConstraints: MediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      const openStream = (selectedId?: string) => navigator.mediaDevices.getUserMedia({
        audio: {
          ...audioConstraints,
          ...(selectedId ? { deviceId: { exact: selectedId } } : {}),
        },
      });
      let stream: MediaStream;
      try {
        stream = await openStream(targetDeviceId);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        const savedDeviceMissing = !deviceId && !!targetDeviceId && ["NotFoundError", "OverconstrainedError"].includes(name);
        if (!savedDeviceMissing) throw error;
        preferredDeviceIdRef.current = "";
        rememberDevice("");
        setSelectedDeviceId("");
        stream = await openStream();
      }
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error("没有检测到可用的麦克风");

      track.enabled = true;
      track.onmute = () => setInputMuted(true);
      track.onunmute = () => setInputMuted(false);
      track.onended = () => { setInputMuted(true); setPermission("denied"); };
      streamRef.current = stream;
      setInputMuted(track.muted);
      setDeviceLabel(track.label || "默认麦克风");
      const actualDeviceId = track.getSettings().deviceId || targetDeviceId || "";
      preferredDeviceIdRef.current = actualDeviceId;
      rememberDevice(actualDeviceId);
      setSelectedDeviceId(actualDeviceId);

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const silentGain = context.createGain();
      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      silentGainRef.current = silentGain;
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.68;
      silentGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(context.destination);

      const samples = new Uint8Array(analyser.fftSize);
      const readVolume = () => {
        analyser.getByteTimeDomainData(samples);
        const sumSquares = samples.reduce((sum, sample) => {
          const normalized = (sample - 128) / 128;
          return sum + normalized * normalized;
        }, 0);
        const rms = Math.sqrt(sumSquares / samples.length);
        const decibels = 20 * Math.log10(Math.max(rms, 0.000_001));
        setVolume(decibels < -55 ? 0 : Math.min(1, Math.max(0, (decibels + 55) / 43)));
        analyserFrameRef.current = requestAnimationFrame(readVolume);
      };
      readVolume();

      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(availableDevices.filter((item) => item.kind === "audioinput"));
      setPermission("granted");
      return stream;
    } catch (error) {
      releaseAudio();
      setPermission("denied");
      throw error;
    }
  }, [releaseAudio]);

  const selectDevice = useCallback(async (deviceId: string) => {
    if (recording) throw new Error("录音进行中不能切换麦克风");
    return prepare(deviceId);
  }, [prepare, recording]);

  const start = useCallback(async (deviceId?: string) => {
    const stream = await prepare(deviceId);
    if (recorderRef.current?.state === "recording") return;
    const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred, audioBitsPerSecond: 128_000 } : { audioBitsPerSecond: 128_000 });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onerror = () => setRecording(false);
    recorder.start(500);
    recorderRef.current = recorder;
    startedAtRef.current = performance.now();
    setRecording(true);
  }, [prepare]);

  const stop = useCallback(() => new Promise<RecordingResult>((resolve, reject) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      reject(new Error("录音尚未开始"));
      return;
    }
    recorder.onstop = () => {
      const type = chunksRef.current[0]?.type || recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      setRecording(false);
      recorderRef.current = null;
      if (!blob.size) {
        reject(new Error("未录制到有效声音，请重新试音"));
        return;
      }
      resolve({ blob, duration: (performance.now() - startedAtRef.current) / 1000 });
    };
    recorder.stop();
  }), []);

  useEffect(() => releaseAudio, [releaseAudio]);

  return {
    permission,
    recording,
    volume,
    inputMuted,
    deviceLabel,
    devices,
    selectedDeviceId,
    prepare,
    selectDevice,
    start,
    stop,
  };
}
