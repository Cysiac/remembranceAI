# Memorial AI

A web app where you upload a deceased loved one's text/email/audio data, then
chat with a voice-enabled persona built from it and generate personalized
talking-head videos.

## Stack

- **Frontend + API:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Worker:** FastAPI (Python) — wraps the Adaption Lab SDK
- **DB + Storage:** Supabase (Postgres + Storage)
- **Voice + Chat:** ElevenLabs (Voice Cloning + Conversational AI + TTS)
- **Video:** Google Gemini Veo (visuals) + ElevenLabs cloned voice (audio),
  muxed server-side with `ffmpeg`

## Repo layout

```
memorial-ai/
  AGENTS.md                       Parallel workflow + AI agent rules
  apps/
    web/                          Next.js app (UI + API routes)
    worker/                       FastAPI sidecar
  packages/
    shared/types.ts               Shared FE/BE contract
  supabase/
    migrations/0001_init.sql      DB schema + storage buckets
  .env.example                    Env template
```

## Running locally

1. Copy `.env.example` to `apps/web/.env.local` and `apps/worker/.env`, fill in
   keys (Adaption, ElevenLabs, Gemini, Supabase).
2. Apply the migration in `supabase/migrations/0001_init.sql` to your Supabase
   project (SQL editor or `supabase db push`).
3. Web: `cd apps/web && pnpm install && pnpm dev` → `http://localhost:3000`
4. Worker: `cd apps/worker && uv pip install -r requirements.txt && uvicorn main:app --reload --port 8000` → `http://localhost:8000`

## Workflow

Read `AGENTS.md` first. Roles, file ownership, branch naming, and AI assistant
rules are codified there.
