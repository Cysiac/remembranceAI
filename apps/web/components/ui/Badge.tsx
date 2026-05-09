import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "gold";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-parchment-100 text-ink-soft border-parchment-200",
  info: "bg-blue-50 text-blue-800 border-blue-100",
  warning: "bg-amber-50 text-amber-800 border-amber-100",
  success: "bg-emerald-50 text-emerald-800 border-emerald-100",
  danger: "bg-rose-50 text-rose-800 border-rose-100",
  gold: "bg-gold-50 text-gold-800 border-gold-200",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    />
  );
}
