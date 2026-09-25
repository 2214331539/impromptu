import { useState, type SetStateAction } from "react";
import { cacheKey, readCache, removeCache, writeCache } from "../utils/taskCache";

export function useCachedState<T>(scope: string, initial: T) {
  const key = cacheKey(scope);
  const [value, setValue] = useState<T>(() => readCache<T>(key) ?? initial);
  const update = (next: SetStateAction<T>) => setValue((previous) => {
    const result = typeof next === "function" ? (next as (old: T) => T)(previous) : next;
    writeCache(key, result);
    return result;
  });
  return [value, update, () => removeCache(key)] as const;
}
