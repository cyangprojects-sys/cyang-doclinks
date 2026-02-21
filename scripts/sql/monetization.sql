-- Monetization / Plan Limits (Hidden)
--
-- Creates:
-- - public.plans (Free/Pro)
-- - users.plan_id (default 'free')
-- - public.user_usage_monthly (views/uploads counters for enforcement)
-- - public.user_usage_daily (upload counters for enforcement)
--
-- Free tier limits (hidden):
-- - 100 views / month
-- - 3 active shares
-- - 500 MB storage
-- - 10 uploads / day
-- - 25 MB max file size
--
-- Pro is currently "unlimited" (null limits) and can be activated later.

create table if not exists public.plans (
  id text primary key,
  name text not null,

  -- NULL means unlimited
  max_views_per_month integer null,
  max_active_shares integer null,
  max_storage_bytes bigint null,
  max_uploads_per_day integer null,
  max_file_size_bytes bigint null,

  allow_custom_expiration boolean not null default false,
  allow_audit_export boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed / upsert plans
insert into public.plans (
  id, name,
  max_views_per_month,
  max_active_shares,
  max_storage_bytes,
  max_uploads_per_day,
  max_file_size_bytes,
  allow_custom_expiration,
  allow_audit_export
)
values
  ('free', 'Free', 100, 3, 524288000, 10, 26214400, false, false),
  ('pro', 'Pro', null, null, null, null, null, true, true)
on conflict (id) do update set
  name = excluded.name,
  max_views_per_month = excluded.max_views_per_month,
  max_active_shares = excluded.max_active_shares,
  max_storage_bytes = excluded.max_storage_bytes,
  max_uploads_per_day = excluded.max_uploads_per_day,
  max_file_size_bytes = excluded.max_file_size_bytes,
  allow_custom_expiration = excluded.allow_custom_expiration,
  allow_audit_export = excluded.allow_audit_export,
  updated_at = now();

-- Add plan_id to users
alter table public.users
  add column if not exists plan_id text not null default 'free';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_plan_fk'
  ) then
    alter table public.users
      add constraint users_plan_fk
      foreign key (plan_id)
      references public.plans(id)
      on delete restrict;
  end if;
end $$;

create index if not exists users_plan_id_idx on public.users(plan_id);

-- Monthly usage counters (views/uploads)
create table if not exists public.user_usage_monthly (
  user_id uuid not null,
  month date not null, -- first day of month in UTC
  view_count integer not null default 0,
  upload_count integer not null default 0,
  primary key (user_id, month)
);

create index if not exists user_usage_monthly_month_idx on public.user_usage_monthly(month desc);

-- Daily usage counters (uploads)
create table if not exists public.user_usage_daily (
  user_id uuid not null,
  day date not null, -- day in UTC
  upload_count integer not null default 0,
  primary key (user_id, day)
);

create index if not exists user_usage_daily_day_idx on public.user_usage_daily(day desc);
