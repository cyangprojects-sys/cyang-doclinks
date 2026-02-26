-- Explicit quarantine override records (temporary, auditable)

create table if not exists public.doc_quarantine_overrides (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid null,
  reason text null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  revoked_by_user_id uuid null,
  revoke_reason text null
);

create index if not exists doc_quarantine_overrides_doc_idx
  on public.doc_quarantine_overrides (doc_id, created_at desc);

create index if not exists doc_quarantine_overrides_active_idx
  on public.doc_quarantine_overrides (doc_id, expires_at)
  where revoked_at is null;
