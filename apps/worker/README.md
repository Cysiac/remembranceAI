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
