# Memorial AI Worker

FastAPI sidecar that owns the heavy persona-build pipeline:

1. Pulls raw uploads from Supabase Storage (signed URLs).
2. Formats text/email/json into the Adaption JSONL schema.
3. Runs the Adaption Lab cleaning pass (with a local fallback if the SDK or API
   key is missing).
4. Clones the voice via ElevenLabs.
5. Builds knowledge-base docs and creates a Conversational AI agent.
6. Patches `personas.status` along the way: `cleaning` → `cloning_voice` →
   `building_agent` → `ready`.

## Local run

```bash
cd apps/worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill the keys
uvicorn main:app --reload --port 8000
```

Endpoints:

- `POST /jobs` — body: `{ "persona_id": "...", "file_keys": ["..."] }`
- `GET  /jobs/{persona_id}` — current state, FE-shaped Persona JSON
- `GET  /healthz`

Auth: pass `Authorization: Bearer $WORKER_SHARED_SECRET` (the Next.js API
routes hold the same value).

## Fixtures

Drop sample data under `apps/worker/fixtures/grandma/` to run the demo
end-to-end without real uploads.

## Container build

The worker ships with a multi-stage `Dockerfile`. Build + run locally:

```bash
docker build -t memorial-worker -f apps/worker/Dockerfile apps/worker
docker run --rm -p 8000:8000 --env-file apps/worker/.env memorial-worker
```

## Hosting

Vercel cannot run the FastAPI worker (long-running tasks + ffmpeg). Pick one
of the included manifests:

- **Fly.io** (`apps/worker/fly.toml`) — the default we recommend.

  ```bash
  cd apps/worker
  fly launch --copy-config --no-deploy   # accept the existing fly.toml
  fly secrets set ELEVENLABS_API_KEY=... ADAPTION_API_KEY=... \
                  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
                  WORKER_SHARED_SECRET=... \
                  WORKER_ALLOWED_ORIGINS=https://your-vercel-domain
  fly deploy
  ```

- **Railway** (`apps/worker/railway.json`) — point Railway at the repo, set
  the same env vars in the dashboard, deploy.
- **Render** (`apps/worker/render.yaml`) — `New +` → `Blueprint`, point at
  the repo. Render will pick up the manifest.

After the worker is live, set on the Vercel project:

```
WORKER_URL=https://memorial-worker.fly.dev   # or your platform's URL
WORKER_SHARED_SECRET=<same value as above>
```

## Supabase

Apply the schema once per environment:

```bash
supabase db push --db-url "$DATABASE_URL"     # or SQL editor → 0001_init.sql
```

The migration creates the `personas` table and the `uploads` + `videos`
buckets as **private**. Verify in Storage → bucket settings that `Public
bucket` is OFF; the web layer mints signed URLs for both reads and writes.
