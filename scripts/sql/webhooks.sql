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

-- Optional (recommended): delivery queue + retry/backoff + dead-letter logging.
-- This enables async delivery via a Vercel cron worker.
create table if not exists public.webhook_deliveries (
  id bigserial primary key,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending', -- pending | delivering | succeeded | dead
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz null,
  last_status int null,
  last_error text null,
  delivered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_next_attempt_idx
  on public.webhook_deliveries (status, next_attempt_at);

create index if not exists webhook_deliveries_owner_idx
  on public.webhook_deliveries (owner_id, created_at desc);

