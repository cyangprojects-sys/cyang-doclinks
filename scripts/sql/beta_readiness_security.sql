-- Beta readiness validation pack (read-only).
-- Run in production/staging before beta launch.
-- This script only executes SELECT statements and safe to_regclass checks.

-- 1) Encryption invariants
select
  count(*)::int as total_docs,
  count(*) filter (where coalesce(encryption_enabled, false) = false)::int as unencrypted_docs,
  count(*) filter (
    where coalesce(encryption_enabled, false) = true
      and coalesce(enc_key_version::text, '') = ''
  )::int as encrypted_missing_key_version
from public.docs;

-- 2) Recent uploads still honoring encryption metadata (last 24h)
select
  count(*)::int as uploads_24h,
  count(*) filter (
    where coalesce(encryption_enabled, false) = true
      and coalesce(enc_key_version::text, '') <> ''
  )::int as encrypted_with_key_version_24h
from public.docs
where created_at > now() - interval '24 hours';

-- 3) Scan / quarantine state distribution
select
  coalesce(lower(scan_status::text), 'unscanned') as scan_status,
  count(*)::int as docs
from public.docs
group by 1
order by 2 desc, 1 asc;

select
  coalesce(lower(moderation_status::text), 'active') as moderation_status,
  count(*)::int as docs
from public.docs
group by 1
order by 2 desc, 1 asc;

-- 4) Dead-letter scan jobs + queue health
select
  count(*) filter (where status = 'queued')::int as queued,
  count(*) filter (where status = 'running')::int as running,
  count(*) filter (where status = 'error')::int as errored,
  count(*) filter (where status = 'dead_letter')::int as dead_letter
from public.malware_scan_jobs;

-- 5) Stripe webhook idempotency / failures (if billing tables exist)
select
  case when to_regclass('public.billing_webhook_events') is not null then true else false end as billing_webhook_events_exists;

select
  coalesce(status, 'unknown')::text as status,
  count(*)::int as events
from public.billing_webhook_events
group by 1
order by 2 desc, 1 asc;

select
  count(*)::int as duplicate_event_ids_should_be_zero
from (
  select event_id
  from public.billing_webhook_events
  group by event_id
  having count(*) > 1
) t;

-- 6) Entitlement drift (users on pro without active/trialing/grace subscription)
select
  count(*)::int as pro_users_without_active_entitlement
from public.users u
left join lateral (
  select 1
  from public.billing_subscriptions bs
  where bs.user_id = u.id
    and bs.plan_id = 'pro'
    and (
      lower(coalesce(bs.status, '')) in ('active', 'trialing')
      or (
        lower(coalesce(bs.status, '')) in ('past_due', 'grace')
        and bs.grace_until is not null
        and bs.grace_until > now()
      )
    )
  order by bs.updated_at desc
  limit 1
) ent on true
where u.plan_id = 'pro'
  and ent is null;

-- 7) Usage enforcement signals
select
  p.id::text as plan_id,
  p.max_file_size_bytes,
  p.max_storage_bytes,
  p.max_active_shares,
  p.max_views_per_month
from public.plans p
where p.id in ('free','pro')
order by p.id asc;

-- 8) Backup and recovery table freshness (if present)
select
  to_regclass('public.backup_runs') is not null as backup_runs_exists,
  to_regclass('public.recovery_drills') is not null as recovery_drills_exists;

select
  (select status::text from public.backup_runs order by created_at desc limit 1) as last_backup_status,
  (
    select extract(epoch from (now() - max(created_at))) / 3600.0
    from public.backup_runs
    where status in ('ok','success')
  ) as backup_hours_since_last_success,
  (
    select extract(epoch from (now() - max(ran_at))) / 86400.0
    from public.recovery_drills
    where status = 'success'
  ) as recovery_days_since_last_success;

-- 9) Active cron telemetry health (24h)
select
  coalesce(sum(case when type = 'cron_run_ok' then 1 else 0 end), 0)::int as cron_ok_24h,
  coalesce(sum(case when type = 'cron_run_failed' then 1 else 0 end), 0)::int as cron_failed_24h
from public.security_events
where created_at > now() - interval '24 hours';

