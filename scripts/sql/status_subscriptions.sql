-- scripts/sql/status_subscriptions.sql
-- Reusable contact subscriptions table.
-- Primary use: daily system status emails from /status subscribe flow.

create extension if not exists pgcrypto;

create table if not exists public.contact_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'suppressed')),
  topics text[] not null default array['status_daily']::text[],
  source text null,
  subscribed_from text null,
  first_subscribed_at timestamptz not null default now(),
  last_subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz null,
  last_status_digest_date date null,
  last_status_digest_sent_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_subscribers_status_idx
  on public.contact_subscribers (status, updated_at desc);

create index if not exists contact_subscribers_topics_gin_idx
  on public.contact_subscribers using gin (topics);

create index if not exists contact_subscribers_last_digest_date_idx
  on public.contact_subscribers (last_status_digest_date);

create or replace function public.touch_contact_subscribers_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contact_subscribers_updated_at on public.contact_subscribers;
create trigger trg_contact_subscribers_updated_at
before update on public.contact_subscribers
for each row execute function public.touch_contact_subscribers_updated_at();
