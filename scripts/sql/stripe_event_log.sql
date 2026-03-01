-- Stripe event log with explicit idempotency key storage.
-- Safe to run multiple times.

create table if not exists public.stripe_event_log (
  event_id text primary key,
  idempotency_key text not null unique,
  event_type text not null,
  event_created_unix bigint null,
  payload jsonb not null,
  status text not null default 'processing', -- processing|processed|ignored|failed|duplicate
  message text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null
);

create index if not exists stripe_event_log_status_received_idx
  on public.stripe_event_log (status, received_at desc);

create index if not exists stripe_event_log_event_type_received_idx
  on public.stripe_event_log (event_type, received_at desc);
