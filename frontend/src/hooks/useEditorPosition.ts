import { useEffect, useRef } from "react";
import { cacheKey, readCache, writeCache } from "../utils/taskCache";

export function useEditorPosition(scope: string, ready: boolean) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ready || !ref.current) return;
    const editor = ref.current;
    const key = cacheKey(`editor:${scope}`);
    const cached = readCache<{ start: number; end: number; top: number }>(key);
    if (cached) { editor.setSelectionRange(cached.start, cached.end); editor.scrollTop = cached.top; }
    const save = () => writeCache(key, { start: editor.selectionStart, end: editor.selectionEnd, top: editor.scrollTop });
    editor.addEventListener("select", save);
    editor.addEventListener("scroll", save);
    editor.addEventListener("input", save);
    return () => { save(); editor.removeEventListener("select", save); editor.removeEventListener("scroll", save); editor.removeEventListener("input", save); };
  }, [scope, ready]);
  return ref;
}
