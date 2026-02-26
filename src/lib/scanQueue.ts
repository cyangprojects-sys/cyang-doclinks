// src/lib/scanQueue.ts
import { sql } from "@/lib/db";

/**
 * Enqueue a malware scan job for a doc (idempotent).
 * - Creates/updates malware_scan_jobs for the doc
 * - Sets docs.scan_status to 'queued' (best-effort)
 */
export async function enqueueDocScan(opts: { docId: string; bucket: string; key: string }) {
  const { docId, bucket, key } = opts;

  // Idempotent insert/update by doc_id unique index.
  await sql`
    insert into public.malware_scan_jobs (doc_id, r2_bucket, r2_key, status, attempts)
    values (${docId}::uuid, ${bucket}, ${key}, 'queued', 0)
    on conflict (doc_id) do update
      set r2_bucket = excluded.r2_bucket,
          r2_key = excluded.r2_key,
          status = case
            when public.malware_scan_jobs.status in ('clean','infected','error','skipped') then 'queued'
            else public.malware_scan_jobs.status
          end,
          last_error = null
  `;

  // Mark queued (do not override quarantine/disabled/deleted).
  await sql`
    update public.docs
      set scan_status = case
        when lower(coalesce(moderation_status,'active')) in ('disabled','quarantined','deleted') then scan_status
        else 'queued'
      end
    where id = ${docId}::uuid
  `;
}

export async function healScanQueue(args?: {
  runningTimeoutMinutes?: number;
  maxAttempts?: number;
  retryDelayMinutes?: number;
}) {
  const runningTimeout = Math.max(1, Number(args?.runningTimeoutMinutes ?? process.env.SCAN_RUNNING_TIMEOUT_MINUTES ?? 20));
  const maxAttempts = Math.max(1, Number(args?.maxAttempts ?? process.env.SCAN_MAX_ATTEMPTS ?? 5));
  const retryDelay = Math.max(1, Number(args?.retryDelayMinutes ?? process.env.SCAN_ERROR_RETRY_MINUTES ?? 10));

  const staleRunning = (await sql`
    with u as (
      update public.malware_scan_jobs
      set
        status = 'queued',
        last_error = 'Auto-requeued stale running job',
        started_at = null
      where status = 'running'
        and started_at < now() - (${runningTimeout}::text || ' minutes')::interval
        and attempts < ${maxAttempts}::int
      returning 1
    )
    select count(*)::int as c from u
  `) as unknown as Array<{ c: number }>;

  const retriedErrors = (await sql`
    with u as (
      update public.malware_scan_jobs
      set
        status = 'queued',
        started_at = null
      where status = 'error'
        and attempts < ${maxAttempts}::int
        and coalesce(finished_at, created_at) < now() - (${retryDelay}::text || ' minutes')::interval
      returning 1
    )
    select count(*)::int as c from u
  `) as unknown as Array<{ c: number }>;

  const saturated = (await sql`
    with u as (
      update public.malware_scan_jobs
      set
        last_error = coalesce(last_error, 'Max attempts reached; awaiting manual review')
      where status in ('queued', 'running', 'error')
        and attempts >= ${maxAttempts}::int
      returning 1
    )
    select count(*)::int as c from u
  `) as unknown as Array<{ c: number }>;

  return {
    runningTimeout,
    maxAttempts,
    retryDelay,
    staleRequeued: Number(staleRunning?.[0]?.c ?? 0),
    errorRequeued: Number(retriedErrors?.[0]?.c ?? 0),
    maxAttemptJobs: Number(saturated?.[0]?.c ?? 0),
  };
}
