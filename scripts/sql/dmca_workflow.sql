-- scripts/sql/dmca_workflow.sql
--
-- DMCA / takedown workflow fields + notices table.
--
-- Adds:
--  - public.dmca_notices
--  - docs.dmca_* fields for quick filtering + last status
--
-- Safe to run multiple times.

create table if not exists public.dmca_notices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- What is being reported / requested
  doc_id uuid null references public.docs(id) on delete set null,
  share_token text null,

  -- Requester / claimant info
  requester_name text null,
  requester_email text null,
  claimant_company text null,

  -- Notice body
  message text null,
  statement text null, -- e.g., good-faith statement / accuracy statement
  signature text null,

  -- Request context (hashed; avoid storing raw IP)
  ip_hash text null,
  user_agent text null,

  -- Admin workflow
  status text not null default 'new', -- new|reviewing|accepted|rejected|actioned
  admin_notes text null,

  action text null, -- quarantine|disable|delete|none
  actioned_at timestamptz null,
  actioned_by uuid null
);

create index if not exists dmca_notices_created_at_idx on public.dmca_notices (created_at desc);
create index if not exists dmca_notices_doc_id_idx on public.dmca_notices (doc_id);
create index if not exists dmca_notices_status_idx on public.dmca_notices (status);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='dmca_status'
  ) then
    alter table public.docs add column dmca_status text not null default 'none'; -- none|pending|takedown|restored
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='dmca_last_notice_id'
  ) then
    alter table public.docs add column dmca_last_notice_id uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='dmca_takedown_at'
  ) then
    alter table public.docs add column dmca_takedown_at timestamptz null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='dmca_takedown_by'
  ) then
    alter table public.docs add column dmca_takedown_by uuid null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='docs' and column_name='dmca_takedown_reason'
  ) then
    alter table public.docs add column dmca_takedown_reason text null;
  end if;
end $$;

create index if not exists docs_dmca_status_idx on public.docs (dmca_status);
