import { useCallback, useEffect, useRef, useState } from "react";
import { cacheKey, readCache, writeCache, removeCache } from "../utils/taskCache";

type Draft = { content: string; dirty: boolean; updatedAt: number };

/** Persist each keystroke locally; serialize server writes so older saves cannot win. */
export function useDurableDraft(scope: string, serverContent: string | undefined, enabled: boolean, save: (content: string) => Promise<void>, preserveLocal = true) {
  const key = cacheKey(scope);
  const [content, setContent] = useState<string | null>(null);
  const [state, setState] = useState<"saved" | "saving" | "local" | "error">("saved");
  const [error, setError] = useState("");
  const initialized = useRef(false);
  const latest = useRef("");
  const saved = useRef("");
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const saveRef = useRef(save);
  saveRef.current = save;
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (initialized.current || serverContent === undefined) return;
    const cached = readCache<Draft>(key);
    latest.current = cached?.dirty && preserveLocal ? cached.content : serverContent;
    saved.current = serverContent;
    initialized.current = true;
    setContent(latest.current);
    setState(latest.current === serverContent ? "saved" : "local");
  }, [key, serverContent, preserveLocal]);
  const update = useCallback((value: string) => {
    latest.current = value;
    setContent(value);
    const ok = writeCache(key, { content: value, dirty: value !== saved.current, updatedAt: Date.now() });
    setState(ok ? "local" : "error");
    setError(ok ? "" : "本机存储空间不足，请保持页面打开并等待服务器保存。");
  }, [key]);
  const flush = useCallback(() => {
    const operation = queue.current.catch(() => undefined).then(async () => {
      const value = latest.current;
      if (!initialized.current || !enabledRef.current || value === saved.current) return;
      setState("saving");
      try {
        await saveRef.current(value);
        saved.current = value;
        writeCache(key, { content: latest.current, dirty: latest.current !== value, updatedAt: Date.now() });
        setState(latest.current === value ? "saved" : "local");
        setError("");
      } catch (cause) {
        setState("error");
        setError(cause instanceof Error ? cause.message : "同步失败，草稿已在本机保留");
        throw cause;
      }
    });
    queue.current = operation;
    return operation;
  }, [key]);
  useEffect(() => {
    if (content === null || !enabled) return;
    const timer = window.setTimeout(() => void flush().catch(() => undefined), 1200);
    return () => window.clearTimeout(timer);
  }, [content, enabled, flush]);
  useEffect(() => {
    const online = () => void flush().catch(() => undefined);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("online", online); void flush().catch(() => undefined); };
  }, [flush]);
  const accept = (value: string) => { saved.current = value; latest.current = value; setContent(value); removeCache(key); setState("saved"); };
  return { content, update, flush, accept, state, error };
}
