import clsx, { type ClassValue } from "clsx";

/** Tiny helper to merge conditional Tailwind class lists. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
