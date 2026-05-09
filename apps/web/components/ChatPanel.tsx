"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PresenceMood } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id"?: string;
          "always-expanded"?: string;
          dismissible?: string;
          "mic-muting"?: string;
          placement?: string;
          transcript?: string;
          "text-input"?: string;
          variant?: string;
          "override-first-message"?: string;
        },
        HTMLElement
      >;
    }
  }
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
  const [presenceMood, setPresenceMood] = useState<PresenceMood>(
    firstMessage ? "speaking" : "idle",
  );
  const [chatOpen, setChatOpen] = useState(false);

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
    (role: "user" | "agent") => {
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
      showPresenceMood(
        detail.source === "user" || detail.role === "user" ? "user" : "agent",
      );
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
      widget.dispatchEvent(
        new CustomEvent("elevenlabs-agent:expand", {
          bubbles: true,
          composed: true,
          detail: { action: "expand" },
        }),
      );
      setChatOpen(true);
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
        <div className="grid gap-3 lg:grid-cols-[1fr_220px] lg:items-start">
          <PresenceAvatar
            mood={presenceMood}
            photoUrl={presencePortraits?.[presenceMood] ?? presencePhotoUrl}
            onPreview={setTimedPresenceMood}
          />

          <div className="rounded-2xl border border-parchment-200 bg-white/75 p-3 shadow-soft">
            <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
              Voice chat
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Keep it tucked away until you are ready to talk.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setChatOpen((open) => !open)}
            >
              {chatOpen ? "Hide chat" : "Open chat"}
            </Button>
          </div>
        </div>

        <div className={chatOpen ? "mt-3" : "sr-only"}>
          <elevenlabs-convai
            className="rememberance-convai-widget"
            ref={(el: HTMLElement | null) => {
              widgetRef.current = el;
            }}
            agent-id={agentId}
            placement="bottom-right"
            transcript="true"
            text-input="true"
            mic-muting="true"
            override-first-message={firstMessage}
          />
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
