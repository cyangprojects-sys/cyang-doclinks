-- Stripe billing state + webhook idempotency
-- Run this before enabling /api/stripe/webhook.

alter table public.users
  add column if not exists stripe_customer_id text null;

create index if not exists users_stripe_customer_id_idx
  on public.users (stripe_customer_id);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.users(id) on delete set null,
  stripe_customer_id text null,
  stripe_subscription_id text not null unique,
  status text not null default 'incomplete',
  plan_id text not null default 'free',
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  grace_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id, updated_at desc);

create index if not exists billing_subscriptions_customer_idx
  on public.billing_subscriptions (stripe_customer_id, updated_at desc);

create index if not exists billing_subscriptions_status_idx
  on public.billing_subscriptions (status, grace_until, current_period_end);

create table if not exists public.billing_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'processing', -- processing|processed|ignored|failed
  message text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null
);

create index if not exists billing_webhook_events_status_received_idx
  on public.billing_webhook_events (status, received_at desc);

