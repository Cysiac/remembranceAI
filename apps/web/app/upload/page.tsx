"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { CreatePersonaRequest, CreatePersonaResponse } from "@shared/types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { UploadDropzone } from "@/components/UploadDropzone";
import { saveRememberanceSummary } from "@/components/savedRememberanceStorage";
import { uploadFile } from "@/lib/uploads";

interface SubmitState {
  phase: "idle" | "uploading" | "creating" | "done" | "error";
  uploadedCount: number;
  totalCount: number;
  message?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [memorialNote, setMemorialNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<SubmitState>({
    phase: "idle",
    uploadedCount: 0,
    totalCount: 0,
  });

  const audioCount = useMemo(
    () => files.filter((f) => f.type.startsWith("audio/")).length,
    [files],
  );
  const textCount = useMemo(
    () =>
      files.filter(
        (f) =>
          f.type.startsWith("text/") ||
          f.type === "application/json" ||
          f.type === "message/rfc822",
      ).length,
    [files],
  );

  const isWorking = state.phase === "uploading" || state.phase === "creating";
  const canSubmit =
    !isWorking &&
    consent &&
    name.trim().length > 0 &&
    relationship.trim().length > 0 &&
    files.length > 0 &&
    textCount > 0;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setState({ phase: "uploading", uploadedCount: 0, totalCount: files.length });
    const uploadedKeys: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const key = await uploadFile(files[i]);
        uploadedKeys.push(key);
        setState((prev) => ({ ...prev, uploadedCount: i + 1 }));
      }

      setState({
        phase: "creating",
        uploadedCount: uploadedKeys.length,
        totalCount: uploadedKeys.length,
        message: "Building your remembrance...",
      });

      const body: CreatePersonaRequest = {
        name: name.trim(),
        relationship: relationship.trim(),
        uploadedFileKeys: uploadedKeys,
      };

      const res = await fetch("/api/persona/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await safeJson(res);
        throw new Error(detail || `create failed (${res.status})`);
      }
      const created = (await res.json()) as CreatePersonaResponse;

      saveRememberanceSummary({
        personaId: created.persona_id,
        name: body.name,
        relationship: body.relationship,
        note: memorialNote.trim() || undefined,
      });

      // Stash photo-only file keys for the persona page so VideoStudio can offer
      // them as Veo reference candidates without re-fetching from Storage.
      try {
        const photoKeys = uploadedKeys.filter((_k, i) =>
          files[i]?.type.startsWith("image/"),
        );
        sessionStorage.setItem(
          `persona:${created.persona_id}:photoKeys`,
          JSON.stringify(photoKeys),
        );
      } catch {
        // ignore — best-effort only
      }

      setState({
        phase: "done",
        uploadedCount: uploadedKeys.length,
        totalCount: uploadedKeys.length,
      });
      router.push(`/persona/${created.persona_id}` as Route);
    } catch (err) {
      setState({
        phase: "error",
        uploadedCount: uploadedKeys.length,
        totalCount: files.length,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="grid gap-8 py-8 sm:grid-cols-12 animate-fade-in">
      <div className="sm:col-span-5 flex flex-col gap-4">
        <Badge tone="gold" className="self-start uppercase tracking-[0.2em]">
          Bring them home
        </Badge>
        <h1 className="font-serif text-4xl text-ink">A few details to begin</h1>
        <p className="text-sm leading-relaxed text-ink-soft">
          Tell us who we are remembering and add the materials you would like
          their voice to be drawn from. The more they wrote, the better the
          remembrance.
        </p>
        <Card className="bg-parchment-50">
          <CardTitle className="text-xl">Trust layer</CardTitle>
          <CardDescription>
            Upload only what you have the right to share. Rememberance AI is an
            interpretation; we never claim it is the real person.
          </CardDescription>
        </Card>
      </div>

      <Card className="sm:col-span-7">
        <form className="flex flex-col gap-6" onSubmit={onSubmit}>
          <CardTitle>Tell us about them</CardTitle>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Their name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Iris Calloway"
                required
                disabled={isWorking}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="relationship">Your relationship</Label>
              <Input
                id="relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. grandmother"
                required
                disabled={isWorking}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">A note for yourself (optional)</Label>
            <Textarea
              id="note"
              value={memorialNote}
              onChange={(e) => setMemorialNote(e.target.value)}
              placeholder="What do you most want to say to them?"
              disabled={isWorking}
            />
            <p className="text-xs text-ink-muted">
              This stays in your browser. It is not uploaded.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Materials</Label>
            <UploadDropzone files={files} onChange={setFiles} disabled={isWorking} />
            <div className="flex flex-wrap gap-2 pt-1 text-xs text-ink-muted">
              <Badge tone={textCount > 0 ? "success" : "warning"}>
                {textCount} text source{textCount === 1 ? "" : "s"}
              </Badge>
              <Badge tone={audioCount > 0 ? "success" : "warning"}>
                {audioCount} voice sample{audioCount === 1 ? "" : "s"}
              </Badge>
              {textCount === 0 ? (
                <span className="text-amber-700">
                  At least one text, email, or chat export is required.
                </span>
              ) : null}
              {audioCount === 0 ? (
                <span className="text-amber-700">
                  A clean voice clip improves cloning quality. Optional, but
                  recommended.
                </span>
              ) : null}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-parchment-200 bg-parchment-50 p-3 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-gold-500"
              disabled={isWorking}
              required
            />
            <span>
              I attest that I have the right to use this material to build a
              Rememberance AI persona, and I understand the result is an
              interpretation, not the real person.
            </span>
          </label>

          {state.phase === "uploading" ? (
            <CardContent className="text-sm text-ink-soft">
              Uploading {state.uploadedCount} / {state.totalCount}...
            </CardContent>
          ) : null}
          {state.phase === "creating" ? (
            <CardContent className="text-sm text-ink-soft">
              {state.message ?? "Creating your remembrance..."}
            </CardContent>
          ) : null}
          {state.phase === "error" ? (
            <CardContent className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {state.message ?? "Something went wrong. Please try again."}
            </CardContent>
          ) : null}

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-muted">
              You can revisit and rebuild this remembrance at any time.
            </p>
            <Button type="submit" size="lg" disabled={!canSubmit} loading={isWorking}>
              {isWorking ? "Working..." : "Begin remembrance"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

async function safeJson(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail || body?.error || JSON.stringify(body).slice(0, 400);
  } catch {
    return "";
  }
}
