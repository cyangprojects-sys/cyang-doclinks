-- Speeds up dashboard backup health queries for GitHub-reported runs.
-- Safe to run multiple times.

create index if not exists backup_runs_source_created_idx
  on public.backup_runs ((coalesce(details->>'source', '')), created_at desc);

