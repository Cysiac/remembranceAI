-- Memorial AI schema (initial)
-- Run via the Supabase SQL editor or CLI:
--   supabase db push
-- or paste into the SQL editor for the project.

create extension if not exists "pgcrypto";

create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  relationship text not null,
  status text not null default 'uploading',
  voice_id text,
  agent_id text,
  dataset_id text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists personas_status_idx on personas (status);
create index if not exists personas_created_at_idx on personas (created_at desc);

-- Storage bucket for raw uploads. Public read OFF; the web layer mints signed URLs
-- for the worker. Idempotent so the migration can be re-run.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Storage bucket for rendered videos (signed-URL access only).
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;
