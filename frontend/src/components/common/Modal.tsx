import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid overflow-y-auto overscroll-contain bg-black/25 p-3 backdrop-blur-[2px] sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[18px] border border-black/10 bg-[#fbfbfc] p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-[20px] sm:p-5">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5" aria-label="关闭"><X className="h-4 w-4" /></button></div>
      {children}
    </div>
  </div>;
}
