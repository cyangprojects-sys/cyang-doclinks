-- scripts/sql/api_keys.sql
-- API keys for programmatic access (admin/owner only).
--
-- Requires: pgcrypto (optional) if you prefer gen_random_uuid; but we use uuid_generate_v4? depends.
-- This table stores ONLY a hash of the API key (never plaintext).

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  prefix text not null, -- e.g. "cyk_ab12cd34"
  key_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  last_used_at timestamptz null
);

create unique index if not exists api_keys_prefix_idx
  on public.api_keys(prefix);

create index if not exists api_keys_owner_idx
  on public.api_keys(owner_id);

create index if not exists api_keys_revoked_idx
  on public.api_keys(revoked_at);

-- Optional: RLS (recommended)
-- alter table public.api_keys enable row level security;
-- create policy api_keys_owner_all
--   on public.api_keys
--   for all
--   using (owner_id = auth.uid())
--   with check (owner_id = auth.uid());
