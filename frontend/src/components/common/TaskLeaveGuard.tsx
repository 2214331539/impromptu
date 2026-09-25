import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { cacheKey, readCache, removeCache, setTaskExitConfirmation, writeCache } from "../../utils/taskCache";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function TaskLeaveGuard({ active, scope, onSave, writing = false }: {
  active: boolean; scope: string; onSave?: () => Promise<void>; writing?: boolean;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => active && currentLocation.pathname !== nextLocation.pathname);
  const [resumed, setResumed] = useState(() => writing && !!readCache(cacheKey(`left:${scope}`)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    if (!active) return;
    const mark = () => writeCache(cacheKey(`left:${scope}`), Date.now());
    const beforeUnload = (event: BeforeUnloadEvent) => {
      mark();
      event.preventDefault();
      event.returnValue = "";
    };
    const visibility = () => {
      if (document.hidden) { mark(); if (writing) void saveRef.current?.().catch(() => undefined); }
      else if (writing && readCache(cacheKey(`left:${scope}`))) setResumed(true);
    };
    setTaskExitConfirmation(async () => {
      if (!window.confirm("任务尚未完成。确认保存进度并退出登录？")) return false;
      try { await saveRef.current?.(); mark(); return true; }
      catch { window.alert("保存未完成，请检查网络后重试。草稿已在本机缓存。"); return false; }
    });
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      setTaskExitConfirmation(undefined);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [active, scope, writing]);
  const continueTask = () => { removeCache(cacheKey(`left:${scope}`)); setResumed(false); };
  return <>
    <Modal open={blocker.state === "blocked"} onClose={() => blocker.state === "blocked" && blocker.reset()} title="确认离开当前任务？">
      <p className="text-sm leading-7 text-muted">{writing ? "离开写作页面会被记录。正文将保存在本机，并尝试同步到服务器；返回时可继续写作。" : "离开后可继续当前任务。若正在录音，将先保存本次已录制的内容。倒计时会继续。"}</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => blocker.state === "blocked" && blocker.reset()}>继续任务</Button><Button loading={saving} onClick={async () => {
        setSaving(true); setError("");
        try { await saveRef.current?.(); writeCache(cacheKey(`left:${scope}`), Date.now()); if (blocker.state === "blocked") blocker.proceed(); }
        catch { setError("同步失败，内容已保存在本机。请检查网络后重试。"); }
        finally { setSaving(false); }
      }}>保存并离开</Button></div>
    </Modal>
    <Modal open={resumed && active} onClose={continueTask} title="已返回写作任务">
      <p className="text-sm leading-7 text-muted">已恢复写作进度，请检查正文后继续。离开页面的行为及时间会被记录，请尽量保持在当前页面完成写作。</p>
      <Button className="mt-5" onClick={continueTask}>继续写作</Button>
    </Modal>
  </>;
}
