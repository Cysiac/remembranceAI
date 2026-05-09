# Memorial AI — Agent & Workflow Rules

This file is the contract that both humans and any AI coding assistants in this repo
(Cursor, Codex, Claude Code, etc.) MUST follow. AI assistants auto-discover
`AGENTS.md` at the repo root, so it loads automatically.

## Roles & File Ownership

Two people work in parallel. Each owns a set of paths and is the ONLY one who writes
there (their AI agents included). Touching the other person's paths requires a chat
ping first.

**Person A — Frontend Owner ("FE")** owns:

- `apps/web/app/page.tsx`
- `apps/web/app/upload/page.tsx`
- `apps/web/app/persona/[id]/page.tsx`
- `apps/web/components/**`
- `apps/web/lib/supabase.ts` (browser client)
- `apps/web/styles/**`
- `apps/web/public/**`

**Person B — Backend Owner ("BE")** owns:

- `apps/worker/**`
- `apps/web/app/api/**`
- `apps/web/lib/elevenlabs.ts`
- `apps/web/lib/veo.ts`
- `apps/web/lib/videoMux.ts`
- `apps/web/lib/promptBuilder.ts`
- `apps/web/lib/supabaseServer.ts` (server-side, service role)
- `supabase/migrations/**`

**Shared paths (touch only with explicit verbal coordination):**

- `packages/shared/types.ts`
- `.env.example`
- `apps/web/package.json` and `apps/worker/requirements.txt`
- `README.md`, `AGENTS.md`

## Rules for AI Coding Assistants (Cursor, Codex, etc.)

When invoked in this repo, every AI assistant MUST:

1. Identify which role it is acting for (FE or BE) by reading the current branch
   name (`feat/fe/...` or `feat/be/...`). If the branch name does not begin with
   `feat/fe/` or `feat/be/`, stop and ask the human.
2. Only edit files inside the owned paths for that role. If a shared path needs
   editing, stop and surface the change to the human.
3. NEVER modify `packages/shared/types.ts` without explicit human approval — the
   types are a contract.
4. NEVER change API endpoint shapes (request/response) without both humans' approval.
5. Run `pnpm typecheck` (web) or `ruff check && pytest` (worker) before suggesting a
   commit.
6. Use commit-message format `[FE] <msg>` or `[BE] <msg>`.
7. Branch from latest `main`, never from another active feature branch.
8. Keep PRs under 300 lines of code where possible.
9. Do not run `git push --force`. Use `git push --force-with-lease` only when
   rebasing your own branch.

## API Contract (locked)

FE consumes these. BE implements these. Lock the shapes before splitting.

- `POST /api/persona/create`
  - Body: `CreatePersonaRequest`
  - Response: `CreatePersonaResponse`
  - Side effect: writes `personas` row, kicks worker via `POST {WORKER_URL}/jobs`
- `GET /api/persona/[id]/status`
  - Response: `Persona`
  - FE polls every 3 seconds while `status !== "ready" && status !== "error"`
- `POST /api/video/generate`
  - Body: `GenerateVideoRequest`
  - Response: `GenerateVideoResponse` (synchronous; route may take 60–180 s)

Worker-internal endpoints (BE only, never called from FE):

- `POST {WORKER_URL}/jobs` — body: `WorkerJobRequest`
- `GET {WORKER_URL}/jobs/{persona_id}` — returns the same shape as
  `GET /api/persona/[id]/status`

## Video Provider

The original plan called for HeyGen. We use **Google Gemini Veo** for the visuals
and **ElevenLabs TTS with the cloned voice** for the audio track, muxed server-side
with `ffmpeg`. The public `POST /api/video/generate` shape is unchanged. See
`apps/web/lib/veo.ts` and `apps/web/lib/videoMux.ts`.

## Sync Points

- **T+0:15** Contracts locked, both unblocked.
- **T+1:30** First integration: FE upload page successfully hits the BE worker.
- **T+3:00** Second integration: FE chat UI loads with a real `agent_id` from BE.
- **T+4:00** Third integration: FE video studio successfully calls the BE Veo route.
- **T+4:30** Feature freeze. Both pair on polish, demo prep, and fallback verification.

If a sync point slips by more than 15 minutes, both stop and triage together.

## Anti-Patterns

- Both people editing `packages/shared/types.ts` simultaneously → drift, ~30 min to resolve.
- Saving all merges for the final hour → ~45 min meltdown at minute 280.
- AI agent silently editing files outside its role's owned paths → broken builds.
- Skipping typecheck before pushing → red `main`, blocks teammate.
- Using `git push --force` instead of `--force-with-lease` → can overwrite teammate commits.
- One person blocked >15 minutes without flagging it → wasted time. Surface immediately.
