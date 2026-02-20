-- scripts/sql/webhooks.sql
-- Outbound webhooks (admin-managed). Each webhook can subscribe to events.

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  url text not null,
  secret text null,
  events text[] not null default array[]::text[],
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz null,
  last_status int null,
  last_error text null
);

create index if not exists webhooks_owner_idx
  on public.webhooks(owner_id);

create index if not exists webhooks_enabled_idx
  on public.webhooks(enabled);

