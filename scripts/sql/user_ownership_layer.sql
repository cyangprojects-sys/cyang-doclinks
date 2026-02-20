-- User Ownership Layer
--
-- What this does:
-- 1) Creates public.users (email + role)
-- 2) Adds public.docs.owner_id
-- 3) Backfills existing docs to a single owner user (replace __OWNER_EMAIL__)
--
-- IMPORTANT: Replace __OWNER_EMAIL__ with your actual owner email *before* running.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'viewer' check (role in ('owner','admin','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);

alter table public.docs
  add column if not exists owner_id uuid;

-- Ensure the owner user exists.
insert into public.users (email, role)
values ('__OWNER_EMAIL__', 'owner')
on conflict (email)
do update set role = 'owner', updated_at = now();

-- Backfill all existing docs that don't yet have an owner.
update public.docs
set owner_id = (select id from public.users where email = '__OWNER_EMAIL__')
where owner_id is null;

-- Enforce non-null ownership going forward.
alter table public.docs
  alter column owner_id set not null;

-- Foreign key for integrity.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'docs_owner_fk'
  ) then
    alter table public.docs
      add constraint docs_owner_fk
      foreign key (owner_id)
      references public.users(id)
      on delete restrict;
  end if;
end $$;

create index if not exists docs_owner_id_created_at_idx
  on public.docs (owner_id, created_at desc);
