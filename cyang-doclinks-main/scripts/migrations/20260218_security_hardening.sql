-- 2026-02-18 Security hardening for cyang-doclinks
-- Adds:
--  A) trusted_devices (8-hour device trust)
--  B) email-bound enforcement (allowed_email)
--  C) download control (allow_download)
--  D) forward/audit logging (doc_access_logs)

-- Needed for gen_random_uuid() in some environments
create extension if not exists pgcrypto;

-- A) Device Trust
create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  device_hash text not null,
  email_used text null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists trusted_devices_share_id_idx on public.trusted_devices(share_id);
create index if not exists trusted_devices_expires_idx on public.trusted_devices(expires_at);

-- B) Email-bound enforcement + C) Download control
-- Prefer doc_shares; also apply to legacy share_tokens if present.

-- doc_shares
alter table if exists public.doc_shares
  add column if not exists allowed_email text;

alter table if exists public.doc_shares
  add column if not exists allow_download boolean not null default false;

-- share_tokens (legacy)
alter table if exists public.share_tokens
  add column if not exists allowed_email text;

alter table if exists public.share_tokens
  add column if not exists allow_download boolean not null default false;

-- D) Forward / Access logging
create table if not exists public.doc_access_logs (
  id uuid primary key default gen_random_uuid(),
  share_id text not null,
  ip text null,
  user_agent text null,
  email_used text null,
  success boolean not null default false,
  failure_reason text null,
  created_at timestamptz not null default now()
);

create index if not exists doc_access_logs_share_id_idx on public.doc_access_logs(share_id);
create index if not exists doc_access_logs_created_at_idx on public.doc_access_logs(created_at);
