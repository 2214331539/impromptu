import { useEffect, useMemo, useRef, useState } from "react";

export function useCountdown(endTime: string | null, serverTime: string, onExpire?: () => void) {
  const [, render] = useState(0);
  const fired = useRef(false);
  const offset = useMemo(() => new Date(serverTime).getTime() - Date.now(), [serverTime]);
  const remaining = endTime ? Math.max(0, (new Date(endTime).getTime() - (Date.now() + offset)) / 1000) : 0;
  useEffect(() => {
    const timer = window.setInterval(() => render((value) => value + 1), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (remaining <= 0 && endTime && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [remaining, endTime, onExpire]);
  return remaining;
}

export function playTimerTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 520;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.4);
  // Clean up the temporary AudioContext after the tone finishes to avoid
  // accumulating suspended contexts that count against the browser limit.
  oscillator.onended = () => {
    gain.disconnect();
    void context.close();
  };
}

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext }
}

