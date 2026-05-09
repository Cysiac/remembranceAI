import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const FIELD_BASE =
  "w-full rounded-xl border border-parchment-300 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 shadow-inner transition-colors focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(FIELD_BASE, "h-10", className)} {...rest} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD_BASE, "min-h-[120px] resize-y leading-relaxed", className)}
    {...rest}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  children,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-xs font-medium uppercase tracking-[0.12em] text-ink-soft",
        className,
      )}
      {...rest}
    >
      {children}
    </label>
  );
}
