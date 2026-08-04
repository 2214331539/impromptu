import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "orange" | "red" }) {
  const tones = {
    neutral: "border-black/10 bg-[#f7f4ee] text-muted",
    blue: "border-[#b7d7ef] bg-[#eaf6ff] text-accent",
    green: "border-[#badbc5] bg-[#edf8ef] text-success",
    orange: "border-[#efd2a8] bg-[#fff4df] text-warning",
    red: "border-[#efc1c1] bg-[#fff0f0] text-danger",
  };
  return <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-[12px] font-medium ${tones[tone]}`}>{children}</span>;
}
