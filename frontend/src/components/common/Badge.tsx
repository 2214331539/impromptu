import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "orange" | "red" }) {
  const tones = {
    neutral: "bg-black/[.045] text-muted",
    blue: "bg-blue-50 text-accent",
    green: "bg-green-50 text-success",
    orange: "bg-orange-50 text-warning",
    red: "bg-red-50 text-danger",
  };
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[12px] font-medium ${tones[tone]}`}>{children}</span>;
}

