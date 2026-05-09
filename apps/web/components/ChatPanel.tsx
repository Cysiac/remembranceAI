"use client";

import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/Badge";
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
  /**
   * Callback exposed so parents (MemoryAnchors etc.) can push a suggested user
   * message into the widget. Reuses the widget's `sendUserMessage` API when
   * available.
   */
  registerSuggester?: (suggest: (prompt: string) => void) => void;
}

export function ChatPanel({ agentId, firstMessage, registerSuggester }: ChatPanelProps) {
  const widgetRef = useRef<HTMLElement | null>(null);

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
      widget.dispatchEvent(
        new CustomEvent("elevenlabs-agent:expand", {
          bubbles: true,
          composed: true,
          detail: { action: "expand" },
        }),
      );
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

      <div className="overflow-hidden rounded-2xl border border-parchment-200 bg-parchment-50 p-3">
        <elevenlabs-convai
          className="rememberance-convai-widget"
          ref={(el: HTMLElement | null) => {
            widgetRef.current = el;
          }}
          agent-id={agentId}
          variant="full"
          placement="bottom"
          transcript="true"
          text-input="true"
          mic-muting="true"
          always-expanded="true"
          dismissible="false"
          override-first-message={firstMessage}
        />
      </div>

      <p className="text-xs text-ink-muted">
        This is an AI interpretation built from material you uploaded. It is not
        the real person.
      </p>
    </Card>
  );
}
