-- Beta readiness report (run manually in prod/staging)
-- Safe read-only checks for security/ops checklist evidence.

-- 1) Encryption invariants
select
  count(*)::int as total_docs,
  count(*) filter (where coalesce(encryption_enabled, false) = true)::int as encrypted_docs,
  count(*) filter (where coalesce(encryption_enabled, false) = false)::int as unencrypted_docs
from public.docs;

-- 2) Quarantine overrides active now
select
  count(*)::int as active_quarantine_overrides
from public.doc_quarantine_overrides
where revoked_at is null
  and expires_at > now();

-- 3) Malware queue health
select
  count(*) filter (where status = 'queued')::int as queued,
  count(*) filter (where status = 'running')::int as running,
  count(*) filter (where status = 'error')::int as errored,
  count(*) filter (where status = 'dead_letter')::int as dead_letter
from public.malware_scan_jobs;

-- 4) Cron telemetry (24h)
select
  coalesce(sum(case when type = 'cron_run_ok' then 1 else 0 end), 0)::int as cron_ok_24h,
  coalesce(sum(case when type = 'cron_run_failed' then 1 else 0 end), 0)::int as cron_failed_24h
from public.security_events
where created_at > now() - interval '24 hours';

-- 5) Cron freshness by expected job (6h)
with expected(job) as (
  values ('webhooks'), ('scan'), ('key-rotation'), ('aggregate'), ('nightly'), ('retention'), ('billing-sync')
),
recent as (
  select coalesce(meta->>'job','')::text as job, max(created_at) as last_ok
  from public.security_events
  where type = 'cron_run_ok'
    and created_at > now() - interval '6 hours'
  group by coalesce(meta->>'job','')
)
select
  e.job,
  r.last_ok
from expected e
left join recent r on r.job = e.job
order by e.job;

-- 6) Backup + recovery freshness
create temporary table if not exists pg_temp._readiness_backup_recovery (
  last_backup_status text,
  backup_hours_since_last_success double precision,
  recovery_days_since_last_success double precision
);
truncate table pg_temp._readiness_backup_recovery;

insert into pg_temp._readiness_backup_recovery
values (null, null, null);

do $$
begin
  if to_regclass('public.backup_runs') is not null then
    execute $sql$
      update pg_temp._readiness_backup_recovery t
      set
        last_backup_status = x.last_backup_status,
        backup_hours_since_last_success = x.backup_hours_since_last_success
      from (
        select
          (select status::text from public.backup_runs order by created_at desc limit 1) as last_backup_status,
          (
            select extract(epoch from (now() - max(created_at))) / 3600.0
            from public.backup_runs
            where status in ('ok','success')
          ) as backup_hours_since_last_success
      ) x
    $sql$;
  end if;

  if to_regclass('public.recovery_drills') is not null then
    execute $sql$
      update pg_temp._readiness_backup_recovery t
      set
        recovery_days_since_last_success = x.recovery_days_since_last_success
      from (
        select
          (
            select extract(epoch from (now() - max(ran_at))) / 86400.0
            from public.recovery_drills
            where status = 'success'
          ) as recovery_days_since_last_success
      ) x
    $sql$;
  end if;
end $$;

select
  last_backup_status,
  backup_hours_since_last_success,
  recovery_days_since_last_success
from pg_temp._readiness_backup_recovery;

-- 7) Index and scan health (high-level)
select
  count(*) filter (
    where (seq_scan + idx_scan) > 0
      and (seq_scan::numeric / (seq_scan + idx_scan)) >= 0.80
      and n_live_tup > 1000
  )::int as high_seq_scan_tables,
  count(*) filter (
    where idx_scan = 0
  )::int as tables_with_no_index_usage_stats
from pg_stat_user_tables
where schemaname = 'public';
