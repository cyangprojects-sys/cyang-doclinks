-- scripts/sql/rate_limit_counters.sql
-- Generic DB-backed rate limiting counters.
--
-- Why:
--   - Works in serverless (no in-memory state)
--   - Can throttle by IP, token, password attempts, etc.
--
-- Run once:
--   psql $DATABASE_URL -f scripts/sql/rate_limit_counters.sql

create table if not exists public.rate_limit_counters (
  scope text not null,
  id text not null,
  bucket bigint not null,
  count int not null default 0,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, id, bucket)
);

create index if not exists rate_limit_counters_scope_id_bucket_idx
  on public.rate_limit_counters (scope, id, bucket desc);

-- Optional: cleanup helper view (not required)
-- You can delete old buckets periodically, e.g. in your nightly cron.
