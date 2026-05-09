"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";

export interface LetterStudioProps {
  personaId: string;
}

interface LetterState {
  phase: "idle" | "writing" | "ready" | "error";
  letter?: string;
  audioUrl?: string;
  message?: string;
}

export function LetterStudio({ personaId }: LetterStudioProps) {
  const [occasion, setOccasion] = useState("");
  const [recipient, setRecipient] = useState("");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [state, setState] = useState<LetterState>({ phase: "idle" });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state.phase === "writing") return;

    setState({ phase: "writing" });
    try {
      const res = await fetch("/api/letter/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona_id: personaId,
          occasion: occasion.trim(),
          recipient_name: recipient.trim() || undefined,
          include_audio: includeAudio,
        }),
      });
      if (!res.ok) {
        const detail = await safeError(res);
        throw new Error(detail || `letter generation failed (${res.status})`);
      }
      const data = (await res.json()) as {
        letter: string;
        audio_base64?: string;
        audio_content_type?: string;
      };

      let audioUrl: string | undefined;
      if (data.audio_base64 && data.audio_content_type) {
        audioUrl = base64ToObjectUrl(data.audio_base64, data.audio_content_type);
      }
      setState({ phase: "ready", letter: data.letter, audioUrl });
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-2xl">Letter for an occasion</CardTitle>
          <CardDescription>
            Ask them to write something for a wedding, birthday, or quiet day.
          </CardDescription>
        </div>
        <Badge tone="warning" className="uppercase tracking-[0.14em]">
          AI interpretation
        </Badge>
      </div>

      <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipient">For whom (optional)</Label>
            <Input
              id="recipient"
              placeholder="e.g. Lila on her wedding day"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={state.phase === "writing"}
            />
          </div>
          <div className="flex flex-col justify-end gap-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                disabled={state.phase === "writing"}
                className="h-4 w-4 accent-gold-500"
              />
              Read it aloud in their cloned voice
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="occasion">Occasion</Label>
          <Textarea
            id="occasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            placeholder="e.g. Lila's wedding next month — she would have loved a few words from you."
            required
            disabled={state.phase === "writing"}
          />
        </div>

        {state.phase === "error" ? (
          <CardContent className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {state.message ?? "Letter generation failed."}
          </CardContent>
        ) : null}

        {state.phase === "ready" && state.letter ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-parchment-200 bg-parchment-50 p-4">
            <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-ink">
              {state.letter}
            </p>
            {state.audioUrl ? (
              <audio controls src={state.audioUrl} className="w-full" />
            ) : null}
            <p className="text-xs text-ink-muted">
              An interpretation. Edit anything that does not feel like them.
            </p>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            loading={state.phase === "writing"}
            disabled={state.phase === "writing" || !occasion.trim()}
          >
            {state.phase === "writing" ? "Writing..." : "Write the letter"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function base64ToObjectUrl(b64: string, mime: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail || body?.error || "";
  } catch {
    return "";
  }
}
