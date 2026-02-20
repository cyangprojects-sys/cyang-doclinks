-- Access tickets: one-time nonces used to exchange for a very short-lived signed R2 URL.
-- Goal: make sharing URLs less effective by binding the exchange step to the requester (IP/UA)
-- and enforcing single-use + quick expiry.

create extension if not exists pgcrypto;

create table if not exists public.access_tickets (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid null,
  share_token text null,
  alias text null,
  purpose text not null, -- 'preview_view' | 'file_download'

  r2_bucket text not null,
  r2_key text not null,
  response_content_type text not null,
  response_content_disposition text not null,

  ip_hash text null,
  ua_hash text null,

  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists access_tickets_expires_at_idx
  on public.access_tickets (expires_at);

create index if not exists access_tickets_used_at_idx
  on public.access_tickets (used_at);

create index if not exists access_tickets_doc_id_idx
  on public.access_tickets (doc_id);
