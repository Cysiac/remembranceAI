"use client";

import { useMemo, useState } from "react";

import type { GenerateVideoRequest, GenerateVideoResponse } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Label, Textarea } from "@/components/ui/Input";
import { uploadFile } from "@/lib/uploads";

export interface VideoStudioProps {
  personaId: string;
  /**
   * Photo keys uploaded with the persona that the user can pick as the Veo
   * reference frame. Only image keys should be passed in.
   */
  candidatePhotoKeys: string[];
  /** Pass `?demo=1` through if the user is on the demo route. */
  isDemo?: boolean;
  onReferencePhotoPreview?: (url: string) => void;
}

interface RenderState {
  phase: "idle" | "uploading" | "rendering" | "ready" | "error";
  videoUrl?: string;
  message?: string;
  startedAt?: number;
}

const PROMPT_TEMPLATES: string[] = [
  "Sitting on the porch in the early evening, telling me a quiet story about us.",
  "Looking gently into the camera, saying a short hello and that they love me.",
  "Standing in the kitchen, smiling, recalling a small moment from a holiday morning.",
];

export function VideoStudio({
  personaId,
  candidatePhotoKeys,
  isDemo,
  onReferencePhotoPreview,
}: VideoStudioProps) {
  const [scene, setScene] = useState<string>(PROMPT_TEMPLATES[0]);
  const [selectedKey, setSelectedKey] = useState<string>(
    candidatePhotoKeys[0] ?? "",
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [state, setState] = useState<RenderState>({ phase: "idle" });

  const isWorking = state.phase === "uploading" || state.phase === "rendering";

  const elapsed = useMemo(() => {
    if (!state.startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
  }, [state.startedAt, state.phase]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isWorking) return;

    let referenceKey = selectedKey;
    try {
      if (pendingFile) {
        setState({ phase: "uploading", startedAt: Date.now() });
        referenceKey = await uploadFile(pendingFile);
        setSelectedKey(referenceKey);
      }
      if (!referenceKey) {
        throw new Error("Choose or upload a reference photograph first.");
      }

      setState({ phase: "rendering", startedAt: Date.now() });

      const body: GenerateVideoRequest = {
        persona_id: personaId,
        scene: scene.trim(),
        reference_photo_key: referenceKey,
      };

      const url = isDemo ? "/api/video/generate?demo=1" : "/api/video/generate";
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await safeError(res);
        throw new Error(detail || `video generation failed (${res.status})`);
      }
      const data = (await res.json()) as GenerateVideoResponse;
      setState({ phase: "ready", videoUrl: data.video_url });
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
          <CardTitle className="text-2xl">Video studio</CardTitle>
          <CardDescription>
            Pair a photograph with a small scene. We render a short, gentle clip
            in their cloned voice.
          </CardDescription>
        </div>
        <Badge tone="warning" className="uppercase tracking-[0.14em]">
          AI interpretation
        </Badge>
      </div>

      <form className="mt-4 flex flex-col gap-5" onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scene">Scene</Label>
          <Textarea
            id="scene"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            disabled={isWorking}
            placeholder={PROMPT_TEMPLATES[0]}
            required
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PROMPT_TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => setScene(tpl)}
                disabled={isWorking}
                className="rounded-full border border-parchment-200 bg-parchment-50 px-3 py-1 text-xs text-ink-soft transition-colors hover:border-gold-300 hover:bg-gold-50 disabled:opacity-60"
              >
                {tpl.length > 60 ? `${tpl.slice(0, 60)}…` : tpl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Reference photograph</Label>
          {candidatePhotoKeys.length > 0 ? (
            <div className="flex flex-col gap-2">
              {candidatePhotoKeys.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-parchment-200 bg-white/60 px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="reference"
                    value={key}
                    checked={selectedKey === key && !pendingFile}
                    onChange={() => {
                      setSelectedKey(key);
                      setPendingFile(null);
                    }}
                    disabled={isWorking}
                    className="accent-gold-500"
                  />
                  <span className="truncate font-mono text-xs text-ink-soft">
                    {key}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              No photos were uploaded with this persona — drop one below.
            </p>
          )}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-parchment-300 bg-white/40 px-3 py-3 text-sm text-ink-soft">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setPendingFile(file);
                if (file) {
                  onReferencePhotoPreview?.(URL.createObjectURL(file));
                }
              }}
              disabled={isWorking}
              className="text-xs"
            />
            {pendingFile ? (
              <span>Uploading {pendingFile.name} on submit.</span>
            ) : (
              <span>Or upload a new reference photograph.</span>
            )}
          </label>
        </div>

        {state.phase === "uploading" ? (
          <CardContent className="text-sm text-ink-soft">
            Uploading reference photograph...
          </CardContent>
        ) : null}
        {state.phase === "rendering" ? (
          <CardContent className="text-sm text-ink-soft">
            Rendering with Veo and their cloned voice. Typical run is 60-180s
            (elapsed: {elapsed}s).
          </CardContent>
        ) : null}
        {state.phase === "error" ? (
          <CardContent className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {state.message ?? "Video generation failed."}
          </CardContent>
        ) : null}
        {state.phase === "ready" && state.videoUrl ? (
          <div className="flex flex-col gap-2">
            <div className="relative overflow-hidden rounded-2xl border border-parchment-200 bg-black">
              <video
                src={state.videoUrl}
                controls
                playsInline
                className="aspect-video w-full"
              />
              <div className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-black/45 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/90">
                AI interpretation · Memorial.AI
              </div>
            </div>
            <a
              href={state.videoUrl}
              download
              className="self-end text-xs text-ink-muted underline hover:text-ink-soft"
            >
              Download MP4
            </a>
          </div>
        ) : null}

        <Button type="submit" loading={isWorking} disabled={isWorking} size="lg">
          {isWorking ? "Working..." : "Render memorial clip"}
        </Button>
      </form>
    </Card>
  );
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail || body?.error || "";
  } catch {
    return "";
  }
}
