-- Share Pack metadata columns
--
-- Adds pack metadata on share links for analytics/UX and optional default pack
-- preference on users. Safe to run multiple times.

alter table public.share_tokens
  add column if not exists pack_id text null,
  add column if not exists pack_version int null;

create index if not exists share_tokens_pack_id_idx
  on public.share_tokens (pack_id);

alter table public.users
  add column if not exists default_pack_id text null;
