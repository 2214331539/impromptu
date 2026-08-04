import { AlertCircle, Download, LoaderCircle, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { downloadMedia, fetchMedia } from "../../api/client";

interface AudioPlayerProps {
  src: string;
  durationHint?: number;
  className?: string;
  onReady?: () => void;
  onError?: () => void;
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

export function AudioPlayer({ src, durationHint = 0, className = "", onReady, onError }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(durationHint);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const controller = new AbortController();
    let ownedUrl: string | null = null;
    setResolvedSrc(null);
    setCurrentTime(0);
    setDuration(durationHint);
    setPlaying(false);
    setLoading(true);
    setError(null);

    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setResolvedSrc(src);
      return () => controller.abort();
    }

    void fetchMedia(src, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        ownedUrl = URL.createObjectURL(blob);
        setResolvedSrc(ownedUrl);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(reason instanceof Error ? reason.message : "录音加载失败");
        onErrorRef.current?.();
      });

    return () => {
      controller.abort();
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [durationHint, src]);

  useEffect(() => {
    if (!playing) return;
    const update = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      setCurrentTime(audio.currentTime);
      frameRef.current = requestAnimationFrame(update);
    };
    frameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing]);

  const syncDuration = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const detected = audio.duration;
    setDuration(Number.isFinite(detected) && detected > 0 ? detected : durationHint);
  }, [durationHint]);

  const handleReady = useCallback(() => {
    syncDuration();
    setLoading(false);
    setError(null);
    onReadyRef.current?.();
  }, [syncDuration]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || loading) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (audio.ended || (duration > 0 && audio.currentTime >= duration)) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    try {
      await audio.play();
    } catch {
      setError("浏览器无法播放这段录音");
      onErrorRef.current?.();
    }
  }, [duration, loading]);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className={`rounded-[14px] border border-black/[.07] bg-[#fafafa] px-3 py-3 ${className}`}>
      {resolvedSrc && (
        <audio
          ref={audioRef}
          className="sr-only"
          preload="auto"
          playsInline
          src={resolvedSrc}
          onLoadedMetadata={handleReady}
          onLoadedData={handleReady}
          onDurationChange={syncDuration}
          onCanPlay={handleReady}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); setCurrentTime(audioRef.current?.currentTime || 0); }}
          onEnded={() => { setPlaying(false); setCurrentTime(duration); }}
          onError={() => {
            setLoading(false);
            setPlaying(false);
            setError("录音无法播放，请重新录制");
            onErrorRef.current?.();
          }}
        />
      )}

      <div className="flex min-h-10 items-center gap-3">
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => void togglePlayback()}
          disabled={loading || !!error}
          aria-label={playing ? "暂停" : currentTime > 0 && currentTime >= duration ? "重新播放" : "播放"}
          title={playing ? "暂停" : "播放"}
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : currentTime > 0 && currentTime >= duration ? <RotateCcw className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>

        <Volume2 className="hidden h-4 w-4 shrink-0 text-muted sm:block" aria-hidden="true" />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink">{clock(currentTime)}</span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(currentTime, duration || 0)}
          disabled={loading || !!error || duration <= 0}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (audioRef.current) audioRef.current.currentTime = next;
            setCurrentTime(next);
          }}
          className="audio-scrubber min-w-0 flex-1"
          style={{ "--audio-progress": `${progress}%` } as React.CSSProperties}
          aria-label="录音播放进度"
        />
        <span className="w-9 shrink-0 text-xs tabular-nums text-muted">{clock(duration)}</span>
      </div>

      {error && <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-danger"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
    </div>
  );
}

interface AudioDownloadButtonProps {
  src: string;
  filename: string;
  className?: string;
}

export function AudioDownloadButton({ src, filename, className = "" }: AudioDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setLoading(true);
    setError(null);
    try {
      await downloadMedia(src, filename);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "下载失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-[#005ebd] disabled:opacity-50" disabled={loading} onClick={() => void download()}>
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {loading ? "正在准备 MP4" : "下载 MP4 录音"}
      </button>
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
