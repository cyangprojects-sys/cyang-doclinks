-- scripts/sql/doc_view_daily.sql
-- Daily aggregation table for doc view analytics (fast read layer).
--
-- Run once in your DB:
--   psql $DATABASE_URL -f scripts/sql/doc_view_daily.sql

create table if not exists public.doc_view_daily (
  doc_id uuid not null references public.docs(id) on delete cascade,
  date date not null,
  view_count int not null default 0,
  unique_ip_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (doc_id, date)
);

create index if not exists doc_view_daily_date_idx
  on public.doc_view_daily (date desc);

create index if not exists doc_view_daily_doc_id_idx
  on public.doc_view_daily (doc_id);
