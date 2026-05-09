"use client";

import { useEffect, useRef, useState } from "react";

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
  /**
   * Callback exposed so parents (MemoryAnchors etc.) can push a suggested user
   * message into the widget. Reuses the widget's `sendUserMessage` API when
   * available.
   */
  registerSuggester?: (suggest: (prompt: string) => void) => void;
}

const TRANSCRIPT_MAX = 80;

export function ChatPanel({ agentId, firstMessage, registerSuggester }: ChatPanelProps) {
  const widgetRef = useRef<HTMLElement | null>(null);
  const [transcript, setTranscript] = useState<ChatTurn[]>(() =>
    firstMessage
      ? [{ role: "agent", text: firstMessage, at: Date.now() }]
      : [],
  );

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
      setTranscript((prev) => [
        ...prev,
        { role: "user", text: prompt, at: Date.now() },
      ]);
    });
  }, [registerSuggester]);

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
