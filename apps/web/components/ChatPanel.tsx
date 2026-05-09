"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PresenceMood } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { "agent-id"?: string },
        HTMLElement
      >;
    }
  }
}

export interface ChatTurn {
  role: "user" | "agent";
  text: string;
  at: number;
}

export interface ChatPanelProps {
  agentId: string;
  firstMessage?: string;
  presencePhotoUrl?: string;
  presencePortraits?: Partial<Record<PresenceMood, string>>;
  /**
   * Callback exposed so parents (MemoryAnchors etc.) can push a suggested user
   * message into the widget. Reuses the widget's `sendUserMessage` API when
   * available.
   */
  registerSuggester?: (suggest: (prompt: string) => void) => void;
}

const TRANSCRIPT_MAX = 80;
const PRESENCE_RESET_MS = 2800;

export function ChatPanel({
  agentId,
  firstMessage,
  presencePhotoUrl,
  presencePortraits,
  registerSuggester,
}: ChatPanelProps) {
  const widgetRef = useRef<HTMLElement | null>(null);
  const presenceTimerRef = useRef<number | null>(null);
  const [transcript, setTranscript] = useState<ChatTurn[]>(() =>
    firstMessage
      ? [{ role: "agent", text: firstMessage, at: Date.now() }]
      : [],
  );
  const [presenceMood, setPresenceMood] = useState<PresenceMood>(
    firstMessage ? "speaking" : "idle",
  );

  const setTimedPresenceMood = useCallback((mood: PresenceMood) => {
    setPresenceMood(mood);
    if (presenceTimerRef.current) {
      window.clearTimeout(presenceTimerRef.current);
    }
    if (mood === "idle") return;
    presenceTimerRef.current = window.setTimeout(() => {
      setPresenceMood("idle");
    }, PRESENCE_RESET_MS);
  }, []);

  const showPresenceMood = useCallback(
    (role: ChatTurn["role"]) => {
      setTimedPresenceMood(role === "agent" ? "speaking" : "listening");
    },
    [setTimedPresenceMood],
  );

  useEffect(() => {
    if (!firstMessage) return;
    presenceTimerRef.current = window.setTimeout(() => {
      setPresenceMood("idle");
    }, PRESENCE_RESET_MS);
  }, [firstMessage]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;

    const onMessage = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { message?: string; text?: string; source?: string; role?: string }
        | undefined;
      if (!detail) return;
      const text = (detail.message ?? detail.text ?? "").toString().trim();
      if (!text) return;
      const role: "user" | "agent" =
        detail.source === "user" || detail.role === "user" ? "user" : "agent";
      showPresenceMood(role);
      setTranscript((prev) => {
        const next = [...prev, { role, text, at: Date.now() }];
        return next.length > TRANSCRIPT_MAX
          ? next.slice(next.length - TRANSCRIPT_MAX)
          : next;
      });
    };

    widget.addEventListener("convai-message", onMessage as EventListener);
    widget.addEventListener("message", onMessage as EventListener);
    return () => {
      widget.removeEventListener("convai-message", onMessage as EventListener);
      widget.removeEventListener("message", onMessage as EventListener);
    };
  }, [showPresenceMood]);

  useEffect(() => {
    return () => {
      if (presenceTimerRef.current) {
        window.clearTimeout(presenceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!registerSuggester) return;
    registerSuggester((prompt: string) => {
      const widget = widgetRef.current as
        | (HTMLElement & {
            sendUserMessage?: (text: string) => void;
            send?: (text: string) => void;
          })
        | null;
      if (!widget) return;

      if (typeof widget.sendUserMessage === "function") {
        widget.sendUserMessage(prompt);
      } else if (typeof widget.send === "function") {
        widget.send(prompt);
      }
      showPresenceMood("user");
      setTranscript((prev) => [
        ...prev,
        { role: "user", text: prompt, at: Date.now() },
      ]);
    });
  }, [registerSuggester, showPresenceMood]);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-2xl">Sit with them</CardTitle>
          <CardDescription>
            Speak or type. They will reply in their own voice.
          </CardDescription>
        </div>
        <Badge tone="warning" className="uppercase tracking-[0.14em]">
          AI interpretation
        </Badge>
      </div>

      <div className="rounded-2xl border border-parchment-200 bg-parchment-50 p-3">
        <PresenceAvatar
          mood={presenceMood}
          photoUrl={presencePortraits?.[presenceMood] ?? presencePhotoUrl}
          onPreview={setTimedPresenceMood}
        />
        <elevenlabs-convai
          ref={(el: HTMLElement | null) => {
            widgetRef.current = el;
          }}
          agent-id={agentId}
        />
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-ink-muted">
          Transcript
        </p>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-xl border border-parchment-200 bg-white/70 p-3 text-sm">
          {transcript.length === 0 ? (
            <p className="text-ink-muted">
              The conversation will mirror here as you talk.
            </p>
          ) : (
            transcript.map((turn, idx) => (
              <div
                key={`${turn.at}-${idx}`}
                className={
                  turn.role === "agent"
                    ? "flex flex-col items-start"
                    : "flex flex-col items-end"
                }
              >
                <span className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                  {turn.role === "agent" ? "Them" : "You"}
                </span>
                <span
                  className={
                    turn.role === "agent"
                      ? "max-w-[85%] rounded-2xl rounded-bl-sm bg-parchment-100 px-3 py-2 text-ink"
                      : "max-w-[85%] rounded-2xl rounded-br-sm bg-gold-100 px-3 py-2 text-ink"
                  }
                >
                  {turn.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        This is an AI interpretation built from material you uploaded. It is not
        the real person.
      </p>
    </Card>
  );
}

function PresenceAvatar({
  mood,
  photoUrl,
  onPreview,
}: {
  mood: PresenceMood;
  photoUrl?: string;
  onPreview: (mood: PresenceMood) => void;
}) {
  const copy =
    mood === "speaking"
      ? "Speaking softly"
      : mood === "listening"
        ? "Listening"
        : "Here with you";
  const ringClass =
    mood === "speaking"
      ? "scale-105 border-gold-300 shadow-[0_0_28px_rgba(236,191,59,0.35)]"
      : mood === "listening"
        ? "border-parchment-300 shadow-soft"
        : "border-parchment-200 shadow-soft";
  const mouthClass =
    mood === "speaking"
      ? "h-3 w-6 rounded-full border-b-2 border-ink-soft animate-pulse"
      : mood === "listening"
        ? "h-1 w-5 rounded-full bg-ink-soft/60"
        : "h-1.5 w-4 rounded-full bg-ink-soft/50";

  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-parchment-200 bg-white/70 p-3">
      <div
        className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-gradient-to-br from-parchment-100 via-white to-gold-100 transition-all duration-300 ${ringClass}`}
        aria-label={`Talking presence preview: ${copy}`}
      >
        {photoUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${photoUrl})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-white/20" />
            <span
              className={`absolute bottom-3 rounded-full bg-white/85 ${
                mood === "speaking" ? "h-2.5 w-8 animate-pulse" : "h-1.5 w-6"
              }`}
            />
          </>
        ) : (
          <>
            <div className="absolute inset-2 rounded-full border border-white/80" />
            <div className="relative flex flex-col items-center gap-2">
              <div className="flex gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-ink-soft" />
                <span className="h-2.5 w-2.5 rounded-full bg-ink-soft" />
              </div>
              <span className={mouthClass} />
            </div>
          </>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
          Presence preview
        </p>
        <p className="font-serif text-xl text-ink">{copy}</p>
        <p className="text-sm text-ink-muted">
          A simple emotional cue before we invest in generated portraits.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPreview("listening")}
            className="rounded-full border border-parchment-200 px-3 py-1 text-xs text-ink-muted transition hover:border-gold-300 hover:text-ink"
          >
            Preview listening
          </button>
          <button
            type="button"
            onClick={() => onPreview("speaking")}
            className="rounded-full border border-parchment-200 px-3 py-1 text-xs text-ink-muted transition hover:border-gold-300 hover:text-ink"
          >
            Preview speaking
          </button>
        </div>
      </div>
    </div>
  );
}
