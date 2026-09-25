import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { cacheKey, readCache, writeCache } from "../../utils/taskCache";

export function PagePosition() {
  const { pathname } = useLocation();
  useEffect(() => {
    const key = cacheKey(`scroll:${pathname}`);
    const position = readCache<number>(key) ?? 0;
    // Query results can arrive after navigation; retry restoration as the page grows.
    let timer = 0;
    let attempts = 0;
    const restore = () => {
      window.scrollTo(0, position);
      if (window.scrollY < position && attempts++ < 20) timer = window.setTimeout(restore, 100);
    };
    restore();
    const cancel = () => window.clearTimeout(timer);
    const save = () => writeCache(key, window.scrollY);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pagehide", save);
    return () => { cancel(); save(); window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel); window.removeEventListener("pagehide", save); };
  }, [pathname]);
  return null;
}
