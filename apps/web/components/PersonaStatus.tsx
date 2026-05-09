import type { PersonaStatus as PersonaStatusValue } from "@shared/types";

import { Badge } from "@/components/ui/Badge";

const COPY: Record<PersonaStatusValue, { label: string; tone: "info" | "warning" | "success" | "danger" | "neutral"; helper: string }> = {
  uploading: {
    label: "Uploading",
    tone: "info",
    helper: "We are receiving the materials you uploaded.",
  },
  cleaning: {
    label: "Cleaning",
    tone: "warning",
    helper: "Reading their words and tidying them up.",
  },
  cloning_voice: {
    label: "Cloning voice",
    tone: "warning",
    helper: "Listening to their recordings and capturing the cadence.",
  },
  building_agent: {
    label: "Building remembrance",
    tone: "warning",
    helper: "Weaving memories, tone, and catchphrases together.",
  },
  ready: {
    label: "Ready",
    tone: "success",
    helper: "Sit with them. Ask about a memory you both share.",
  },
  error: {
    label: "Something went wrong",
    tone: "danger",
    helper: "We had trouble building the remembrance. You can try again.",
  },
};

export interface PersonaStatusProps {
  status: PersonaStatusValue;
  errorMessage?: string;
}

export function PersonaStatus({ status, errorMessage }: PersonaStatusProps) {
  const { label, tone, helper } = COPY[status] ?? COPY.uploading;
  const showSpinner = status !== "ready" && status !== "error";

  return (
    <div className="flex items-start gap-3">
      <Badge tone={tone} className="uppercase tracking-[0.16em]">
        {showSpinner ? (
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 animate-pulse-soft rounded-full bg-current"
          />
        ) : null}
        {label}
      </Badge>
      <div className="text-sm text-ink-soft">
        <p>{helper}</p>
        {status === "error" && errorMessage ? (
          <p className="mt-1 text-xs text-rose-700">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
