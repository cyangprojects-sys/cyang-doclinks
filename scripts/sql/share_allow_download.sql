-- Share download policy toggle
--
-- Adds share-level control for recipient download access.
-- Safe to run multiple times.

alter table public.share_tokens
  add column if not exists allow_download boolean not null default true;
