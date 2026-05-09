"use client";

import Link from "next/link";
import type { Route } from "next";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Persona } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
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

export default function PersonaPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const personaId = params.id;

  const [state, setState] = useState<PersonaState>({
    loading: true,
    candidatePhotoKeys: [],
  });
  const suggesterRef = useRef<((prompt: string) => void) | null>(null);

  // Pull uploaded photo keys we stashed in sessionStorage when the persona was
  // created in the upload flow. They live on the original page transition only.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`persona:${personaId}:photoKeys`);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        setState((prev) => ({
          ...prev,
          candidatePhotoKeys: Array.isArray(parsed)
            ? parsed.filter((k) => IMAGE_EXT.test(k))
            : [],
        }));
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

            <VideoStudio
              personaId={persona.id}
              candidatePhotoKeys={state.candidatePhotoKeys}
              isDemo={isDemo}
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
