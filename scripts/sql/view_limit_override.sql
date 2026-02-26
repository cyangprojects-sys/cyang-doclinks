-- Temporary owner-level view limit override (admin safety valve)

create table if not exists public.owner_view_limit_overrides (
  owner_id uuid primary key,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null,
  reason text null,
  expires_at timestamptz not null
);

create index if not exists owner_view_limit_overrides_expires_idx
  on public.owner_view_limit_overrides (expires_at);
