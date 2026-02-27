-- Block abusive IPs at the server layer (hashed only; no raw IP storage).
-- Safe to run multiple times.

create table if not exists public.abuse_ip_blocks (
  ip_hash text primary key,
  reason text not null,
  source text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  meta jsonb null
);

create index if not exists abuse_ip_blocks_expires_at_idx
  on public.abuse_ip_blocks (expires_at);

