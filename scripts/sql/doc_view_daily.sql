-- scripts/sql/doc_view_daily.sql
<<<<<<< ours
-- Daily aggregation table for doc view analytics (fast read layer).
--
-- Run once in your DB:
--   psql $DATABASE_URL -f scripts/sql/doc_view_daily.sql
=======
-- Daily aggregation table for document views.
--
-- This keeps lightweight daily counters derived from public.doc_views.
-- Run once in your DB:
--   psql "$DATABASE_URL" -f scripts/sql/doc_view_daily.sql
>>>>>>> theirs

create table if not exists public.doc_view_daily (
  doc_id uuid not null references public.docs(id) on delete cascade,
  date date not null,
  view_count int not null default 0,
  unique_ip_count int not null default 0,
<<<<<<< ours
=======
  last_viewed_at timestamptz null,
>>>>>>> theirs
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (doc_id, date)
);

<<<<<<< ours
create index if not exists doc_view_daily_date_idx
  on public.doc_view_daily (date desc);

create index if not exists doc_view_daily_doc_id_idx
  on public.doc_view_daily (doc_id);
=======
create index if not exists doc_view_daily_date_idx on public.doc_view_daily (date desc);
create index if not exists doc_view_daily_doc_idx on public.doc_view_daily (doc_id);

>>>>>>> theirs
