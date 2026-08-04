import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />{label}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="surface flex min-h-56 flex-col items-center justify-center px-6 text-center">
    <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-black/[.035]"><Inbox className="h-5 w-5 text-muted" /></span>
    <h3 className="font-medium text-ink">{title}</h3><p className="mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

export function ErrorState({ message, retry }: { message?: string; retry?: () => void }) {
  return <div className="surface flex min-h-52 flex-col items-center justify-center px-6 text-center">
    <AlertCircle className="h-6 w-6 text-danger" /><p className="mt-3 text-sm text-muted">{message || "内容加载失败"}</p>
    {retry && <Button className="mt-4" variant="secondary" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={retry}>重试</Button>}
  </div>;
}

export function InlineMessage({ type = "error", children }: { type?: "error" | "success" | "info"; children: ReactNode }) {
  const tone = type === "error" ? "bg-red-50 text-danger border-red-100" : type === "success" ? "bg-green-50 text-success border-green-100" : "bg-blue-50 text-accent border-blue-100";
  return <div className={`rounded-[11px] border px-3.5 py-2.5 text-sm ${tone}`}>{children}</div>;
}

