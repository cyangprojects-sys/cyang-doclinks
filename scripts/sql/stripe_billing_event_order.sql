-- Enforce monotonic Stripe webhook ordering on subscription state.
-- Safe to run multiple times.

alter table if exists public.billing_subscriptions
  add column if not exists last_event_created bigint not null default 0;

create index if not exists billing_subscriptions_last_event_created_idx
  on public.billing_subscriptions (stripe_subscription_id, last_event_created desc);

