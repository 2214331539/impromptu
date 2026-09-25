import { useEffect } from "react";

export type IntegrityEvent = {
  event_type: string;
  source: string;
  detail?: string;
};

const blockedTypes = ["copy", "cut", "paste", "drop", "contextmenu"] as const;

export function useAntiCopyPaste(
  active: boolean,
  report: (event: IntegrityEvent) => void,
) {
  useEffect(() => {
    if (!active) return;
    const lastSentAt = new Map<string, number>();

    const reportThrottled = (event: IntegrityEvent) => {
      const now = Date.now();
      const last = lastSentAt.get(event.event_type) || 0;
      if (now - last < 5000) return;
      lastSentAt.set(event.event_type, now);
      report(event);
    };

    const captureEvent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      reportThrottled({
        event_type: `${event.type}_blocked`,
        source: event.type,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || !["c", "x", "v"].includes(key)) return;
      event.preventDefault();
      const type = key === "c" ? "copy" : key === "x" ? "cut" : "paste";
      reportThrottled({
        event_type: `${type}_blocked`,
        source: "keydown",
        detail: `${event.ctrlKey ? "Ctrl" : "Cmd"}+${key.toUpperCase()}`,
      });
    };

    blockedTypes.forEach((type) => document.addEventListener(type, captureEvent, true));
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      blockedTypes.forEach((type) => document.removeEventListener(type, captureEvent, true));
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active, report]);
}
