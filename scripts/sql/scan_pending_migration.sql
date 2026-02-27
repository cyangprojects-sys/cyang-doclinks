-- Normalize document scan status to the new async pipeline invariant.
-- Safe to run multiple times.
--
-- Goal:
-- Upload -> scan_status='pending' -> background scan -> clean/quarantined
-- Serve/download is only allowed for scan_status='clean'.

update public.docs
set scan_status = 'pending'
where lower(coalesce(scan_status::text, 'unscanned')) in ('unscanned', 'queued', 'running');

