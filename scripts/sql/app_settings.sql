-- scripts/sql/app_settings.sql
-- Simple key/value settings table (JSONB) for runtime feature toggles.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Keep updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

-- Seed default retention settings (idempotent)
insert into public.app_settings (key, value)
values (
  'retention',
  jsonb_build_object(
    'enabled', true,
    'deleteExpiredShares', true,
    'shareGraceDays', 0
  )
)
on conflict (key) do nothing;

-- Seed default expiration alert settings (idempotent)
insert into public.app_settings (key, value)
values (
  'expiration_alerts',
  jsonb_build_object(
    'enabled', true,
    'days', 3,
    'emailEnabled', true
  )
)
on conflict (key) do nothing;
