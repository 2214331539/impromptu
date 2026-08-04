import type { ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
    <div className="w-full max-w-lg rounded-[20px] border border-black/10 bg-[#fbfbfc] p-5 shadow-2xl">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5" aria-label="关闭"><X className="h-4 w-4" /></button></div>
      {children}
    </div>
  </div>;
}

