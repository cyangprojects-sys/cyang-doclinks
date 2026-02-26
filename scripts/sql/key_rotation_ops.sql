-- Operational key management: active-key override, change history, and rotation jobs

create table if not exists public.master_key_settings (
  id boolean primary key default true,
  active_key_id text null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid null,
  notes text null,
  constraint master_key_settings_singleton check (id = true)
);

create table if not exists public.master_key_changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  changed_by_user_id uuid null,
  previous_key_id text null,
  new_key_id text not null,
  reason text null,
  rollback_of_change_id uuid null
);

create index if not exists master_key_changes_created_at_idx
  on public.master_key_changes (created_at desc);

create table if not exists public.key_rotation_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  requested_by_user_id uuid null,
  from_key_id text not null,
  to_key_id text not null,
  status text not null default 'queued', -- queued | running | completed | failed | canceled
  scanned_count integer not null default 0,
  rotated_count integer not null default 0,
  failed_count integer not null default 0,
  max_batch integer not null default 250,
  last_error text null
);

create index if not exists key_rotation_jobs_status_created_at_idx
  on public.key_rotation_jobs (status, created_at desc);
