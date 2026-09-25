// Versioned, per-account caches. Server state remains authoritative for phases and permissions.
export function cacheKey(scope: string) {
  const user = readCache<{ id: number }>("speaking-lab-user");
  return `impromptu:v1:${user?.id ?? "guest"}:${scope}`;
}

export function readCache<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || "null") as T | null; } catch { return null; }
}

export function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function removeCache(key: string) {
  try { localStorage.removeItem(key); } catch { /* Private-mode storage may be unavailable. */ }
}

export type TaskPosition = { path: string; title: string; updatedAt: number };

export function rememberTask(path: string, title: string) {
  writeCache(cacheKey("last-task"), { path, title, updatedAt: Date.now() });
}

export function forgetTask(path: string) {
  const key = cacheKey("last-task");
  if (readCache<TaskPosition>(key)?.path === path) removeCache(key);
}

export let confirmTaskExit: (() => Promise<boolean>) | undefined;
export function setTaskExitConfirmation(callback: typeof confirmTaskExit) { confirmTaskExit = callback; }
