-- V3: Multi-tenant Organizations + OIDC (Option 2: /org/[slug]/login)
--
-- What this does:
-- 1) Creates public.organizations with per-tenant OIDC settings (client secret stored encrypted by app)
-- 2) Adds org_id to public.users and public.docs
-- 3) Backfills existing rows to a default org (slug = 'default')
--
-- IMPORTANT:
-- - Your app must set OIDC_SECRETS_KEY (32-byte base64) before you store oidc_client_secret_enc.
-- - This script does NOT generate client secrets; it just creates the schema.
--
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text null,

  -- Enterprise SSO / OIDC settings (optional)
  oidc_enabled boolean not null default false,
  oidc_issuer text null,
  oidc_client_id text null,
  oidc_client_secret_enc text null, -- encrypted by app (AES-256-GCM)
  allowed_domains text[] not null default '{}'::text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_slug_idx on public.organizations (slug);

-- Ensure a default org exists (used for backfill + non-tenant flows)
insert into public.organizations (slug, name)
values ('default', 'Default')
on conflict (slug) do nothing;

-- Add org_id to users (if users table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='users') then
    alter table public.users
      add column if not exists org_id uuid;

    -- Backfill null org_id to default
    update public.users
      set org_id = (select id from public.organizations where slug='default')
    where org_id is null;

    -- Enforce not-null once backfilled
    alter table public.users
      alter column org_id set not null;

    -- Add FK if missing
    if not exists (
      select 1 from pg_constraint where conname = 'users_org_fk'
    ) then
      alter table public.users
        add constraint users_org_fk
        foreign key (org_id)
        references public.organizations(id)
        on delete restrict;
    end if;

    create index if not exists users_org_id_idx on public.users (org_id);
  end if;
end $$;

-- Add org_id to docs (if docs table exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='docs') then
    alter table public.docs
      add column if not exists org_id uuid;

    update public.docs
      set org_id = (select id from public.organizations where slug='default')
    where org_id is null;

    alter table public.docs
      alter column org_id set not null;

    if not exists (
      select 1 from pg_constraint where conname = 'docs_org_fk'
    ) then
      alter table public.docs
        add constraint docs_org_fk
        foreign key (org_id)
        references public.organizations(id)
        on delete restrict;
    end if;

    create index if not exists docs_org_id_created_at_idx
      on public.docs (org_id, created_at desc);
  end if;
end $$;
