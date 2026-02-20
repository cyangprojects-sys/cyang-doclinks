-- scripts/sql/doc_views_attribution.sql
-- Adds lightweight attribution fields to doc_views so admin analytics can answer:
--   - views by share token
--   - funnel-ish events (viewer served vs raw served vs download)
--
-- Safe to run multiple times.

alter table if exists public.doc_views
  add column if not exists share_token text null;

alter table if exists public.doc_views
  add column if not exists event_type text null;

create index if not exists doc_views_share_token_created_at_idx
  on public.doc_views (share_token, created_at desc);

create index if not exists doc_views_event_type_created_at_idx
  on public.doc_views (event_type, created_at desc);
