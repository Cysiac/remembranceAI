# Deploying Memorial AI

Two services to host:

1. **Web app** (`apps/web`) — Next.js, runs on Vercel.
2. **Worker** (`apps/worker`) — FastAPI, runs anywhere that can host a Docker
   container (Fly.io, Railway, Render, your own VM).

Plus a Supabase project for Postgres + Storage. Veo and ElevenLabs are reached
over HTTPS, no infra needed.

## 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com/).
2. Apply the schema:

   ```bash
   supabase db push --db-url "$DATABASE_URL"
   # or paste supabase/migrations/0001_init.sql into the SQL editor
   ```

3. In **Storage**, confirm both `uploads` and `videos` buckets exist and that
   `Public bucket` is **OFF**. The web layer mints signed URLs for both.
4. Grab the URL, anon key, and service-role key from **Project settings →
   API**. You'll need them in both Vercel and the worker.

## 2. Worker

Pick one platform; manifests live next to `apps/worker/main.py`.

### Fly.io (recommended)

```bash
cd apps/worker
fly launch --copy-config --no-deploy   # accepts the existing fly.toml
fly secrets set \
  ELEVENLABS_API_KEY=...        \
  ADAPTION_API_KEY=...          \
  SUPABASE_URL=...              \
  SUPABASE_SERVICE_ROLE_KEY=... \
  WORKER_SHARED_SECRET=...      \
  WORKER_ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
fly deploy
```

The worker URL will be `https://<app>.fly.dev`. Verify with:

```bash
curl https://<app>.fly.dev/healthz
# {"status":"ok"}
```

### Railway

1. Connect this repo, point Railway at `apps/worker/Dockerfile`.
2. Set the same env vars in the dashboard.
3. Deploy. Railway gives you a public URL.

### Render

1. **New +** → **Blueprint**, point at this repo. `apps/worker/render.yaml`
   is picked up automatically.
2. Fill in the env-var values flagged `sync: false`.
3. Deploy.

### Locally with Docker

```bash
docker build -t memorial-worker -f apps/worker/Dockerfile apps/worker
docker run --rm -p 8000:8000 --env-file apps/worker/.env memorial-worker
```

## 3. Web app on Vercel

1. **Import project** → choose this repo.
2. **Root directory:** `apps/web`. Framework: Next.js (autodetected).
3. Add the environment variables (Project → Settings → Environment Variables).
   Mirror the keys in [`apps/web/.env.example`](apps/web/.env.example):

   ```
   ADAPTION_API_KEY
   ELEVENLABS_API_KEY
   GEMINI_API_KEY
   GEMINI_VEO_MODEL                  # optional, default veo-3.0-generate-preview
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   NEXT_PUBLIC_SUPABASE_URL          # = SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY     # = SUPABASE_ANON_KEY
   WORKER_URL                        # https://<your-worker>.fly.dev
   WORKER_SHARED_SECRET              # same value as on the worker
   DEMO_VOICE_ID                     # filled by `npm run bake:demo`
   DEMO_AGENT_ID                     # filled by `npm run bake:demo`
   DEMO_VIDEO_URL                    # optional; pre-baked demo MP4
   ```

4. Deploy. The first build will install Tailwind + native deps
   (`ffmpeg-static`, `@google/genai`) — already wired in
   [`apps/web/next.config.mjs`](apps/web/next.config.mjs).

### Vercel plan: Hobby vs Pro

[`apps/web/app/api/video/generate/route.ts`](apps/web/app/api/video/generate/route.ts)
declares `maxDuration = 300` so a Veo render (60–180 s typical) has headroom.

- **Pro plan** — `maxDuration` honoured, the route works as-is. ✅ Recommended.
- **Hobby plan** — capped at **60 s**. Veo will time out.
  Workarounds:
  1. Use the demo path only (set `DEMO_VIDEO_URL`; the route short-circuits on
     `?demo=1`).
  2. Pre-bake videos with `npm run bake:demo -- --video --photo ...` and serve
     them from Storage.
  3. Move the render into the worker (BE follow-up: add a `POST /videos`
     endpoint to `apps/worker` and have the Next.js route proxy through).

## 4. Pre-bake the demo persona

The `?demo=1` flow expects a real ElevenLabs voice + agent. Bake them once:

```bash
cd apps/web
cp .env.example .env.local   # fill at minimum ELEVENLABS_API_KEY (+ Gemini/Supabase if --video)
npm run bake:demo -- --voice ./scripts/demo-fixtures/grandma-voice.mp3
# → prints DEMO_VOICE_ID and DEMO_AGENT_ID

# Optional: also bake one Veo video to back DEMO_VIDEO_URL.
npm run bake:demo -- \
  --voice ./scripts/demo-fixtures/grandma-voice.mp3 \
  --photo ./scripts/demo-fixtures/grandma-photo.jpg \
  --video
```

Paste the output into Vercel → Settings → Environment Variables.

## 5. Smoke checklist

After deploy, hit the Vercel URL and walk through:

- [ ] `/` → landing renders with both CTAs.
- [ ] `/persona/demo?demo=1` → persona page reaches `ready`, ChatPanel shows
      the ElevenLabs widget, MemoryAnchors lists chips.
- [ ] `/upload` → upload a small `.txt` and a `.mp3`, accept consent, submit.
      You should land on `/persona/<id>` and see the status badge transition
      from `cleaning` → `cloning_voice` → `building_agent` → `ready`.
- [ ] On `?demo=1`, render a video from the studio and confirm `DEMO_VIDEO_URL`
      shows up.

If anything fails, check the worker logs (`fly logs` / Railway / Render
dashboard) and Vercel function logs side by side — they share `WORKER_SHARED_SECRET`
so a 401/403 between them is the most common breakage.
