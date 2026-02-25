-- scripts/sql/abuse_moderation.sql
--
-- Abuse reporting + moderation primitives.
--
-- Adds:
--  - public.abuse_reports (viewer-submitted)
--  - docs moderation fields (status, scan/risk)
--
-- Safe to run multiple times (IF NOT EXISTS / DO blocks where needed).

-- 1) Abuse reports table
create table if not exists public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- What is being reported
  share_token text null,
  doc_id uuid null,

  -- Reporter info (optional)
  reporter_email text null,
  message text null,

  -- Request context (hashed; avoid storing raw IP)
  ip_hash text null,
  user_agent text null,

  -- Admin workflow
  status text not null default 'new', -- new|reviewing|closed
  admin_notes text null,
  closed_at timestamptz null,
  closed_by uuid null
);

create index if not exists abuse_reports_created_at_idx on public.abuse_reports (created_at desc);
create index if not exists abuse_reports_share_token_idx on public.abuse_reports (share_token);
create index if not exists abuse_reports_doc_id_idx on public.abuse_reports (doc_id);

-- 2) Docs moderation fields
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='moderation_status'
  ) then
    alter table public.docs add column moderation_status text not null default 'active'; -- active|disabled|quarantined|deleted
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='disabled_at'
  ) then
    alter table public.docs add column disabled_at timestamptz null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='disabled_by'
  ) then
    alter table public.docs add column disabled_by uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='disabled_reason'
  ) then
    alter table public.docs add column disabled_reason text null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='scan_status'
  ) then
    alter table public.docs add column scan_status text not null default 'unscanned'; -- unscanned|clean|risky|quarantined|skipped_encrypted
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='risk_level'
  ) then
    alter table public.docs add column risk_level text not null default 'low'; -- low|medium|high
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='risk_flags'
  ) then
    alter table public.docs add column risk_flags jsonb null;
  end if;
end $$;

create index if not exists docs_moderation_status_idx on public.docs (moderation_status);
create index if not exists docs_scan_status_idx on public.docs (scan_status);
create index if not exists docs_risk_level_idx on public.docs (risk_level);

