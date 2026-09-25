import { useEffect, useRef } from "react";
import { api } from "../api/client";

function clientVisitId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function keepalivePost(path: string, body: unknown) {
  const token = localStorage.getItem("speaking-lab-token");
  const url = `${import.meta.env.VITE_API_URL || "/api/v1"}${path}`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

export function useWritingPresence(submissionId: number, enabled: boolean) {
  const visitIdRef = useRef<string | null>(null);
  const requests = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!enabled || !Number.isFinite(submissionId)) return;

    const send = (request: () => Promise<unknown>) => { requests.current = requests.current.catch(() => undefined).then(request).catch(() => undefined); };
    const enter = () => {
      if (visitIdRef.current || document.hidden) return;
      const id = clientVisitId();
      visitIdRef.current = id;
      send(() => api<void>(`/writing/submissions/${submissionId}/presence/enter`, {
        method: "POST",
        body: JSON.stringify({ client_visit_id: id }),
      }));
    };

    const heartbeat = async () => {
      if (!visitIdRef.current) return;
      await api<void>(`/writing/submissions/${submissionId}/presence/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ client_visit_id: visitIdRef.current }),
      });
    };

    const leave = async (reason: string) => {
      if (!visitIdRef.current) return;
      const current = visitIdRef.current;
      visitIdRef.current = null;
      send(() => keepalivePost(`/writing/submissions/${submissionId}/presence/leave`, {
        client_visit_id: current,
        reason,
      }));
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void leave("visibility_hidden").catch(() => undefined);
      } else {
        enter();
      }
    };

    const onPageHide = () => {
      void leave("pagehide").catch(() => undefined);
    };

    enter();
    const timer = window.setInterval(() => void heartbeat().catch(() => undefined), 10_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      void leave("leave").catch(() => undefined);
    };
  }, [submissionId, enabled]);
}
