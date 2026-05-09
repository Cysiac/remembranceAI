"use client";

import Link from "next/link";
import type { Route } from "next";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  GeneratePortraitsRequest,
  GeneratePortraitsResponse,
  Persona,
  PresenceMood,
} from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { ChatPanel } from "@/components/ChatPanel";
import { DailyMemory } from "@/components/DailyMemory";
import { EraPicker } from "@/components/EraPicker";
import { LetterStudio } from "@/components/LetterStudio";
import { MemoryAnchors } from "@/components/MemoryAnchors";
import { PersonaStatus } from "@/components/PersonaStatus";
import { VideoStudio } from "@/components/VideoStudio";

const POLL_INTERVAL_MS = 3000;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|gif)$/i;

interface PersonaState {
  persona?: Persona;
  loading: boolean;
  error?: string;
  candidatePhotoKeys: string[];
}

interface PortraitState {
  phase: "idle" | "generating" | "ready" | "error";
  message?: string;
}

export default function PersonaPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const personaId = params.id;

  const [state, setState] = useState<PersonaState>({
    loading: true,
    candidatePhotoKeys: [],
  });
  const [presencePhotoUrl, setPresencePhotoUrl] = useState<string>();
  const [presencePortraits, setPresencePortraits] = useState<
    Partial<Record<PresenceMood, string>>
  >({});
  const [portraitState, setPortraitState] = useState<PortraitState>({
    phase: "idle",
  });
  const suggesterRef = useRef<((prompt: string) => void) | null>(null);

  // Pull uploaded photo keys we stashed in sessionStorage when the persona was
  // created in the upload flow. They live on the original page transition only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`persona:${personaId}:photoKeys`);
      const photoPreviewUrl = sessionStorage.getItem(
        `persona:${personaId}:photoPreviewUrl`,
      );
      const portraitsRaw = sessionStorage.getItem(`persona:${personaId}:portraits`);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        setState((prev) => ({
          ...prev,
          candidatePhotoKeys: Array.isArray(parsed)
            ? parsed.filter((k) => IMAGE_EXT.test(k))
            : [],
        }));
      }
      if (photoPreviewUrl) {
        setPresencePhotoUrl(photoPreviewUrl);
      }
      if (portraitsRaw) {
        const portraits = parsePortraits(portraitsRaw);
        if (Object.keys(portraits).length > 0) {
          setPresencePortraits(portraits);
          setPortraitState({ phase: "ready" });
        }
      }
    } catch {
      // ignore — sessionStorage is best-effort
    }
  }, [personaId]);

  const fetchStatus = useCallback(async (signal?: AbortSignal): Promise<Persona | null> => {
    const url = isDemo
      ? `/api/persona/${personaId}/status?demo=1`
      : `/api/persona/${personaId}/status`;
    const res = await fetch(url, { cache: "no-store", signal });
    if (!res.ok) {
      const detail = await safeError(res);
      throw new Error(detail || `status fetch failed (${res.status})`);
    }
    return (await res.json()) as Persona;
  }, [isDemo, personaId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function tick() {
      try {
        const persona = await fetchStatus(controller.signal);
        if (cancelled || !persona) return;
        setState((prev) => ({
          persona,
          loading: false,
          candidatePhotoKeys: prev.candidatePhotoKeys,
        }));
        if (persona.status !== "ready" && persona.status !== "error") {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
        timer = window.setTimeout(tick, POLL_INTERVAL_MS * 2);
      }
    }

    let timer = window.setTimeout(tick, 0);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [fetchStatus]);

  const onSuggest = useCallback((prompt: string) => {
    suggesterRef.current?.(prompt);
  }, []);

  const persona = state.persona;
  const isReady = persona?.status === "ready";
  const referencePhotoKey = state.candidatePhotoKeys[0];

  const generatePortraits = useCallback(async () => {
    if (!persona || !referencePhotoKey) {
      setPortraitState({
        phase: "error",
        message: "Upload a reference photograph first.",
      });
      return;
    }

    setPortraitState({ phase: "generating" });
    try {
      const body: GeneratePortraitsRequest = {
        persona_id: persona.id,
        reference_photo_key: referencePhotoKey,
      };
      const res = await fetch("/api/portraits/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await safeError(res);
        throw new Error(detail || `portrait generation failed (${res.status})`);
      }
      const data = (await res.json()) as GeneratePortraitsResponse;
      setPresencePortraits(data.portraits);
      setPortraitState({ phase: "ready" });
      try {
        sessionStorage.setItem(
          `persona:${personaId}:portraits`,
          JSON.stringify(data.portraits),
        );
      } catch {
        // ignore — signed URLs are a best-effort session cache
      }
    } catch (err) {
      setPortraitState({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [persona, personaId, referencePhotoKey]);

  return (
    <div className="flex flex-col gap-8 py-6 animate-fade-in">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Badge tone="gold" className="self-start uppercase tracking-[0.18em]">
            {isDemo ? "Demo persona" : "Your remembrance"}
          </Badge>
          <h1 className="font-serif text-4xl text-ink">
            {persona?.name || "Sitting with someone you love"}
          </h1>
          {persona?.relationship ? (
            <p className="text-sm text-ink-muted">
              your {persona.relationship}
            </p>
          ) : null}
        </div>
        <Link
          href={"/upload" as Route}
          className="text-sm text-ink-muted underline hover:text-ink-soft"
        >
          Build a different remembrance
        </Link>
      </header>

      <Card className="bg-parchment-50">
        {state.loading && !persona ? (
          <CardDescription>Looking for the remembrance...</CardDescription>
        ) : state.error && !persona ? (
          <div className="flex flex-col gap-2">
            <CardTitle className="text-xl">We could not find them.</CardTitle>
            <CardDescription>{state.error}</CardDescription>
          </div>
        ) : persona ? (
          <PersonaStatus
            status={persona.status}
            errorMessage={persona.errorMessage}
          />
        ) : null}
      </Card>

      {isReady && persona ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 flex flex-col gap-6">
            {persona.agent_id ? (
              <ChatPanel
                agentId={persona.agent_id}
                firstMessage={persona.metadata?.firstMessage}
                presencePhotoUrl={presencePhotoUrl}
                presencePortraits={presencePortraits}
                registerSuggester={(fn) => {
                  suggesterRef.current = fn;
                }}
              />
            ) : (
              <Card>
                <CardTitle className="text-xl">Agent not available yet</CardTitle>
                <CardDescription>
                  The conversational agent has not been issued. Try again in a
                  moment.
                </CardDescription>
              </Card>
            )}

            <Card className="bg-parchment-50">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Generated presence portraits</CardTitle>
                  <CardDescription>
                    Create three gentle portrait states for the chat presence:
                    idle, listening, and speaking.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  loading={portraitState.phase === "generating"}
                  disabled={!referencePhotoKey}
                  onClick={generatePortraits}
                >
                  {portraitState.phase === "ready" ? "Regenerate portraits" : "Generate portraits"}
                </Button>
              </div>
              {!referencePhotoKey ? (
                <p className="mt-3 text-sm text-ink-muted">
                  Upload an image while creating the persona to enable generated
                  portrait states.
                </p>
              ) : null}
              {portraitState.phase === "generating" ? (
                <p className="mt-3 text-sm text-ink-soft">
                  Generating portraits with OpenAI. This can take a minute.
                </p>
              ) : null}
              {portraitState.phase === "ready" ? (
                <p className="mt-3 text-sm text-emerald-700">
                  Portrait states are ready. Use the preview buttons above to see
                  the avatar switch expressions.
                </p>
              ) : null}
              {portraitState.phase === "error" ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  {portraitState.message ?? "Portrait generation failed."}
                </p>
              ) : null}
            </Card>

            <VideoStudio
              personaId={persona.id}
              candidatePhotoKeys={state.candidatePhotoKeys}
              isDemo={isDemo}
              onReferencePhotoPreview={(url) => {
                setPresencePhotoUrl(url);
                try {
                  sessionStorage.setItem(
                    `persona:${personaId}:photoPreviewUrl`,
                    url,
                  );
                } catch {
                  // ignore — preview is best-effort
                }
              }}
            />

            <LetterStudio personaId={persona.id} />
          </div>

          <aside className="lg:col-span-4 flex flex-col gap-6">
            <DailyMemory
              anchors={persona.metadata?.memoryAnchors ?? []}
              catchphrases={persona.metadata?.catchphrases ?? []}
              onSuggest={onSuggest}
            />

            <MemoryAnchors
              anchors={persona.metadata?.memoryAnchors ?? []}
              onSuggest={onSuggest}
            />

            <EraPicker
              eraTags={persona.metadata?.eraTags}
              onSuggest={onSuggest}
            />

            {persona.metadata?.catchphrases?.length ? (
              <Card className="bg-parchment-50">
                <CardTitle className="text-lg">Their voice patterns</CardTitle>
                <CardDescription>
                  Phrases that came up often in their writing.
                </CardDescription>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {persona.metadata.catchphrases.slice(0, 8).map((phrase) => (
                    <li
                      key={phrase}
                      className="rounded-full border border-parchment-200 bg-white/70 px-3 py-1 text-xs text-ink-soft"
                    >
                      “{phrase}”
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
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

function parsePortraits(raw: string): Partial<Record<PresenceMood, string>> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") return {};

  const record = parsed as Record<string, unknown>;
  const portraits: Partial<Record<PresenceMood, string>> = {};
  for (const mood of ["idle", "listening", "speaking"] as PresenceMood[]) {
    if (typeof record[mood] === "string") {
      portraits[mood] = record[mood];
    }
  }
  return portraits;
}
