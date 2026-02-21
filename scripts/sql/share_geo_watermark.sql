-- Geo Restriction + Watermarking (MVP)
--
-- Adds best-effort policy columns to docs + share_tokens:
-- - allowed_countries: ISO-3166 alpha-2 allowlist (TEXT[])
-- - blocked_countries: ISO-3166 alpha-2 denylist (TEXT[])
-- - watermark_enabled: boolean toggle (share-level overrides doc-level)
-- - watermark_text: optional text to display in the viewer watermark overlay
--
-- Safe to run multiple times.

alter table public.docs
  add column if not exists allowed_countries text[] null,
  add column if not exists blocked_countries text[] null,
  add column if not exists watermark_enabled boolean not null default false,
  add column if not exists watermark_text text null;

alter table public.share_tokens
  add column if not exists allowed_countries text[] null,
  add column if not exists blocked_countries text[] null,
  add column if not exists watermark_enabled boolean not null default false,
  add column if not exists watermark_text text null;

create index if not exists docs_allowed_countries_gin_idx
  on public.docs using gin (allowed_countries);

create index if not exists docs_blocked_countries_gin_idx
  on public.docs using gin (blocked_countries);

create index if not exists share_tokens_allowed_countries_gin_idx
  on public.share_tokens using gin (allowed_countries);

create index if not exists share_tokens_blocked_countries_gin_idx
  on public.share_tokens using gin (blocked_countries);
