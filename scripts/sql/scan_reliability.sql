-- Scan reliability extensions: exponential backoff + dead-letter support

alter table public.malware_scan_jobs
  add column if not exists next_retry_at timestamptz null;

create index if not exists malware_scan_jobs_next_retry_idx
  on public.malware_scan_jobs (status, next_retry_at);
