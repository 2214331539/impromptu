import { formatClock } from "../../utils/format";

export function CountdownRing({ remaining, total, label }: { remaining: number; total: number; label: string }) {
  const progress = total ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const circumference = 2 * Math.PI * 102;
  const urgent = remaining > 0 && remaining <= 10;
  return <div className={`relative mx-auto aspect-square w-full max-w-[270px] ${urgent ? "text-danger" : "text-accent"}`}>
    <svg className="h-full w-full -rotate-90" viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="102" fill="none" stroke="rgba(0,0,0,.055)" strokeWidth="7" /><circle cx="120" cy="120" r="102" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} className="transition-[stroke-dashoffset,color] duration-200" /></svg>
    <div className="absolute inset-0 grid place-content-center text-center"><p className="text-[13px] text-muted">{label}</p><p className={`mt-2 text-[52px] font-semibold tabular-nums leading-none text-ink ${urgent ? "text-danger" : ""}`}>{formatClock(remaining)}</p>{urgent && <p className="mt-3 text-xs font-medium text-danger">即将结束</p>}</div>
  </div>;
}

