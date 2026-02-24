-- scripts/sql/security_encryption.sql
-- Adds optional per-document encryption metadata + decrypt audit logs + security telemetry.

-- 1) Docs: encryption metadata
alter table public.docs
  add column if not exists encryption_enabled boolean not null default false,
  add column if not exists enc_alg text,
  add column if not exists enc_iv bytea,
  add column if not exists enc_key_version text,
  add column if not exists enc_wrapped_key bytea,
  add column if not exists enc_wrap_iv bytea,
  add column if not exists enc_wrap_tag bytea;

create index if not exists docs_encryption_enabled_idx on public.docs (encryption_enabled);

-- 2) Decrypt audit logs
create table if not exists public.doc_decrypt_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  doc_id uuid not null,
  ticket_id uuid,
  ip_hash text,
  ua_hash text,
  key_version text
);

create index if not exists doc_decrypt_log_doc_id_idx on public.doc_decrypt_log (doc_id, created_at desc);
create index if not exists doc_decrypt_log_created_at_idx on public.doc_decrypt_log (created_at desc);

-- 3) Security telemetry events
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  severity text not null,
  ip_hash text,
  actor_user_id uuid,
  org_id uuid,
  doc_id uuid,
  scope text,
  message text,
  meta jsonb
);

create index if not exists security_events_created_at_idx on public.security_events (created_at desc);
create index if not exists security_events_type_idx on public.security_events (type, created_at desc);
create index if not exists security_events_ip_hash_idx on public.security_events (ip_hash, created_at desc);
