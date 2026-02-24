-- scripts/sql/enterprise_master_keys.sql
-- Enterprise encryption ops: master key revocation table (DB-backed instant kill-switch)
--
-- Keys are still sourced from DOC_MASTER_KEYS (env). This table stores revocations only.
-- If a key_id is present here, decrypt and new uploads using that key MUST fail.

create table if not exists public.master_key_revocations (
  key_id text primary key,
  revoked_at timestamptz not null default now(),
  revoked_by_user_id uuid
);

create index if not exists master_key_revocations_revoked_at_idx
  on public.master_key_revocations (revoked_at desc);
