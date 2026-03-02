-- Signup + activation tables for manual account onboarding.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.signup_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text not null,
  last_name text not null,
  company text,
  job_title text,
  country text,
  password_hash text not null,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  activation_token_hash text,
  activation_expires_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signup_accounts_activation_token_idx
  on public.signup_accounts (activation_token_hash);

create index if not exists signup_accounts_activated_at_idx
  on public.signup_accounts (activated_at);

create table if not exists public.legal_acceptances (
  id bigserial primary key,
  email text not null,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_source text not null default 'signup',
  ip_hash text,
  user_agent text
);

create unique index if not exists legal_acceptances_email_version_uniq
  on public.legal_acceptances (email, terms_version);
