"use client";

import { useMemo } from "react";

import type { MemoryAnchor } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

export interface DailyMemoryProps {
  anchors: MemoryAnchor[];
  catchphrases: string[];
  onSuggest?: (prompt: string) => void;
}

/**
 * "On this day" sidebar widget. Picks a stable memory + catchphrase for today's
 * date so the user gets a small, repeatable ritual when they return.
 */
export function DailyMemory({ anchors, catchphrases, onSuggest }: DailyMemoryProps) {
  const seed = useMemo(() => dayOfYearSeed(), []);

  const memory = useMemo(() => {
    if (anchors.length === 0) return null;
    return anchors[seed % anchors.length];
  }, [anchors, seed]);

  const phrase = useMemo(() => {
    if (catchphrases.length === 0) return null;
    return catchphrases[seed % catchphrases.length];
  }, [catchphrases, seed]);

  if (!memory && !phrase) return null;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="bg-gradient-to-br from-gold-50 to-parchment-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg">On this day</CardTitle>
        <Badge tone="gold" className="uppercase tracking-[0.14em]">
          {today}
        </Badge>
      </div>
      {memory ? (
        <div className="mt-3 flex flex-col gap-1">
          <p className="font-serif text-base text-ink">{memory.title}</p>
          {memory.description ? (
            <CardDescription>{memory.description}</CardDescription>
          ) : null}
          {onSuggest ? (
            <button
              type="button"
              onClick={() => onSuggest(`Tell me about ${memory.title}.`)}
              className="self-start text-xs font-medium text-gold-700 underline-offset-2 hover:underline"
            >
              Bring it up in the conversation
            </button>
          ) : null}
        </div>
      ) : null}
      {phrase ? (
        <p className="mt-3 border-t border-parchment-200 pt-3 font-serif text-sm italic text-ink-soft">
          “{phrase}”
        </p>
      ) : null}
    </Card>
  );
}

function dayOfYearSeed(): number {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
