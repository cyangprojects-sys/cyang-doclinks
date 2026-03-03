-- MFA storage for privileged users (admin/owner).
-- Stores encrypted TOTP secrets.

create table if not exists public.user_mfa (
  user_id uuid primary key references public.users(id) on delete cascade,
  totp_secret text,
  pending_secret text,
  recovery_code_hashes jsonb not null default '[]'::jsonb,
  recovery_codes_generated_at timestamptz,
  enabled_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_mfa
  add column if not exists recovery_code_hashes jsonb not null default '[]'::jsonb;

alter table public.user_mfa
  add column if not exists recovery_codes_generated_at timestamptz;

create index if not exists user_mfa_enabled_idx on public.user_mfa (enabled_at);
