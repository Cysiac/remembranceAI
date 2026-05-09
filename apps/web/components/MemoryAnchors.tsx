"use client";

import type { MemoryAnchor } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

export interface MemoryAnchorsProps {
  anchors: MemoryAnchor[];
  onSuggest?: (prompt: string) => void;
}

export function MemoryAnchors({ anchors, onSuggest }: MemoryAnchorsProps) {
  if (!anchors || anchors.length === 0) {
    return (
      <Card className="bg-parchment-50">
        <CardTitle className="text-lg">Memories</CardTitle>
        <CardDescription>
          As you talk, ask about a moment you shared. We will surface anchors
          here as we learn more.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="bg-parchment-50">
      <CardTitle className="text-lg">Memories to draw on</CardTitle>
      <CardDescription>
        Tap an anchor and we will gently nudge the conversation toward it.
      </CardDescription>
      <ul className="mt-4 flex flex-col gap-2">
        {anchors.slice(0, 8).map((anchor, idx) => {
          const prompt = anchor.title
            ? `Tell me about ${anchor.title}.`
            : "Tell me about that memory.";
          return (
            <li key={`${anchor.title}-${idx}`}>
              <button
                type="button"
                onClick={() => onSuggest?.(prompt)}
                disabled={!onSuggest}
                className="group flex w-full flex-col gap-1 rounded-xl border border-parchment-200 bg-white/60 p-3 text-left text-sm transition-colors hover:border-gold-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="font-serif text-base text-ink">
                  {anchor.title || "Untitled memory"}
                </span>
                {anchor.description ? (
                  <span className="text-xs leading-relaxed text-ink-muted">
                    {anchor.description}
                  </span>
                ) : null}
                {anchor.people && anchor.people.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {anchor.people.slice(0, 4).map((person) => (
                      <Badge key={person} tone="neutral" className="text-[10px]">
                        {person}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
