"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

export interface EraOption {
  id: string;
  label: string;
  helper: string;
  /** Sentence injected into the suggester to nudge the conversation. */
  prompt: string;
}

const DEFAULT_ERAS: EraOption[] = [
  {
    id: "today",
    label: "Today",
    helper: "Their voice as we knew them at the end.",
    prompt: "Tell me how you would talk to me today, with everything you'd lived through.",
  },
  {
    id: "young-parent",
    label: "Young parent",
    helper: "Tired, scrappy, hopeful — kids underfoot.",
    prompt:
      "Talk to me the way you would have when you were a young parent — tired and full of ideas.",
  },
  {
    id: "newlywed",
    label: "Newlywed",
    helper: "Just starting out, before the kids.",
    prompt:
      "Take me back to when you were newly married, before the kids and the moves. What did you dream about?",
  },
  {
    id: "elder",
    label: "Elder",
    helper: "Reflective, patient, quietly mischievous.",
    prompt:
      "Talk to me like an elder looking back, patient and a little mischievous, with nothing left to prove.",
  },
];

export interface EraPickerProps {
  eraTags?: string[];
  onSuggest?: (prompt: string) => void;
}

export function EraPicker({ eraTags, onSuggest }: EraPickerProps) {
  const [selected, setSelected] = useState<string>("today");

  const eras = useMemo(() => {
    if (!eraTags || eraTags.length === 0) return DEFAULT_ERAS;
    const extras = eraTags.map<EraOption>((tag) => ({
      id: `tag-${tag}`,
      label: tag,
      helper: `From their writings tagged "${tag}".`,
      prompt: `Talk to me the way you did during the "${tag}" years.`,
    }));
    return [...DEFAULT_ERAS, ...extras];
  }, [eraTags]);

  return (
    <Card className="bg-parchment-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg">Time machine</CardTitle>
        <Badge tone="warning" className="uppercase tracking-[0.14em]">
          Experimental
        </Badge>
      </div>
      <CardDescription>
        Pick an era and we will gently point the conversation that way.
      </CardDescription>
      <div className="mt-3 flex flex-col gap-2">
        {eras.map((era) => {
          const active = era.id === selected;
          return (
            <button
              key={era.id}
              type="button"
              onClick={() => {
                setSelected(era.id);
                onSuggest?.(era.prompt);
              }}
              disabled={!onSuggest}
              className={
                "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors " +
                (active
                  ? "border-gold-400 bg-gold-50"
                  : "border-parchment-200 bg-white/60 hover:border-gold-300")
              }
            >
              <span className="font-serif text-base text-ink">{era.label}</span>
              <span className="text-xs text-ink-muted">{era.helper}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
