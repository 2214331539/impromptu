import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, className = "", children, disabled, ...props }: Props) {
  const variants: Record<Variant, string> = {
    primary: "bg-accent text-white hover:bg-[#0064ca] border-transparent",
    secondary: "bg-white text-ink hover:bg-black/[.035] border-black/10",
    danger: "bg-white text-danger hover:bg-red-50 border-red-200",
    ghost: "bg-transparent text-muted hover:bg-black/[.045] border-transparent",
  };
  const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-[14px]", lg: "h-12 px-5 text-[15px]" };
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-[11px] border font-medium transition active:scale-[.985] disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
