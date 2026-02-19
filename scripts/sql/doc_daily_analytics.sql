-- scripts/sql/doc_daily_analytics.sql
-- Daily aggregation table for doc view analytics.
--
-- This intentionally keeps only lightweight counters derived from public.doc_views.
-- Run once in your DB:
--   psql $DATABASE_URL -f scripts/sql/doc_daily_analytics.sql

create table if not exists public.doc_daily_analytics (
  day date not null,
  doc_id uuid not null references public.docs(id) on delete cascade,
  views int not null default 0,
  unique_ips int not null default 0,
  last_viewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, doc_id)
);

create index if not exists doc_daily_analytics_day_idx on public.doc_daily_analytics (day desc);
create index if not exists doc_daily_analytics_doc_idx on public.doc_daily_analytics (doc_id);
