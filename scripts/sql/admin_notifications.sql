-- scripts/sql/admin_notifications.sql
-- In-app admin notifications (e.g. expirations) with simple "mark read" support.

create extension if not exists pgcrypto;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  kind text not null, -- e.g. 'alias_expiring', 'share_expiring'
  doc_id uuid null references public.docs(id) on delete cascade,
  alias text null,
  share_token text null,
  title text null,
  expires_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create unique index if not exists admin_notifications_dedupe_key_idx
  on public.admin_notifications(dedupe_key);

create index if not exists admin_notifications_owner_read_idx
  on public.admin_notifications(owner_id, read_at, created_at desc);

create index if not exists admin_notifications_owner_expires_idx
  on public.admin_notifications(owner_id, expires_at);
