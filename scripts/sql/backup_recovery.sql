-- Backup + recovery operations tracking tables

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null, -- ok | success | failed | skipped
  details jsonb not null default '{}'::jsonb
);

create index if not exists backup_runs_created_idx on public.backup_runs (created_at desc);
create index if not exists backup_runs_status_created_idx on public.backup_runs (status, created_at desc);

create table if not exists public.recovery_drills (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  status text not null, -- success | failed
  notes text null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists recovery_drills_ran_idx on public.recovery_drills (ran_at desc);
create index if not exists recovery_drills_status_ran_idx on public.recovery_drills (status, ran_at desc);
