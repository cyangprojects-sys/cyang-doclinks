-- Enterprise org membership + invitations model.
-- Run after scripts/sql/v3_multi_tenant_oidc.sql

create table if not exists public.org_memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('viewer','admin','owner')) default 'viewer',
  invited_by_user_id uuid null references public.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  revoked_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_memberships_user_idx
  on public.org_memberships(user_id);

create index if not exists org_memberships_org_role_idx
  on public.org_memberships(org_id, role);

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer','admin','owner')) default 'viewer',
  token_hash text not null,
  invited_by_user_id uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz null,
  accepted_by_user_id uuid null references public.users(id) on delete set null,
  revoked_at timestamptz null
);

create unique index if not exists org_invites_token_hash_active_idx
  on public.org_invites(token_hash)
  where accepted_at is null and revoked_at is null;

create index if not exists org_invites_org_email_idx
  on public.org_invites(org_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists org_invites_org_created_idx
  on public.org_invites(org_id, created_at desc);

-- Keep updated_at fresh on membership changes.
create or replace function public.tg_touch_org_membership_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_org_membership_updated_at on public.org_memberships;
create trigger trg_touch_org_membership_updated_at
before update on public.org_memberships
for each row execute function public.tg_touch_org_membership_updated_at();

-- Backfill memberships from existing users table org bindings.
insert into public.org_memberships (org_id, user_id, role, joined_at)
select
  u.org_id,
  u.id,
  case
    when u.role = 'owner' then 'owner'
    when u.role = 'admin' then 'admin'
    else 'viewer'
  end as role,
  now()
from public.users u
where u.org_id is not null
on conflict (org_id, user_id) do nothing;
