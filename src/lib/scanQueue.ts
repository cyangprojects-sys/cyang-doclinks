// src/lib/scanQueue.ts
import { sql } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BUCKET_LEN = 128;
const MAX_KEY_LEN = 1024;

function assertDbConfigured() {
  if (!String(process.env.DATABASE_URL || "").trim()) {
    throw new Error("Missing DATABASE_URL");
  }
}

function normalizeUuidOrNull(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function normalizeTextOrNull(value: unknown, maxLen: number): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function boundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Enqueue a malware scan job for a doc (idempotent).
 * - Creates/updates malware_scan_jobs for the doc
 * - Sets docs.scan_status to 'pending' (best-effort)
 */
export async function enqueueDocScan(opts: { docId: string; bucket: string; key: string }) {
  assertDbConfigured();
  const docId = normalizeUuidOrNull(opts.docId);
  const bucket = normalizeTextOrNull(opts.bucket, MAX_BUCKET_LEN);
  const key = normalizeTextOrNull(opts.key, MAX_KEY_LEN);
  if (!docId) throw new Error("INVALID_DOC_ID");
  if (!bucket) throw new Error("INVALID_BUCKET");
  if (!key) throw new Error("INVALID_KEY");

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

  // Mark pending (do not override quarantine/disabled/deleted).
  await sql`
    update public.docs
      set scan_status = case
        when lower(coalesce(moderation_status,'active')) in ('disabled','quarantined','deleted') then scan_status
        else 'pending'
      end
    where id = ${docId}::uuid
  `;
}

export async function healScanQueue(args?: {
  runningTimeoutMinutes?: number;
  maxAttempts?: number;
  retryBaseMinutes?: number;
  retryMaxMinutes?: number;
}) {
  assertDbConfigured();
  const runningTimeout = boundedInt(args?.runningTimeoutMinutes ?? process.env.SCAN_RUNNING_TIMEOUT_MINUTES ?? 20, 20, 1, 240);
  const maxAttempts = boundedInt(args?.maxAttempts ?? process.env.SCAN_MAX_ATTEMPTS ?? 5, 5, 1, 50);
  const retryBase = boundedInt(args?.retryBaseMinutes ?? process.env.SCAN_RETRY_BASE_MINUTES ?? 5, 5, 1, 120);
  const retryMaxRaw = boundedInt(args?.retryMaxMinutes ?? process.env.SCAN_RETRY_MAX_MINUTES ?? 720, 720, 1, 1_440);
  const retryMax = Math.max(retryBase, retryMaxRaw);

  const staleRunning = (await sql`
    with requeue as (
      update public.malware_scan_jobs
      set
        status = 'queued',
        last_error = 'Auto-requeued stale running job',
        started_at = null,
        next_retry_at = null
      where status = 'running'
        and started_at < now() - (${runningTimeout}::text || ' minutes')::interval
        and attempts < ${maxAttempts}::int
      returning 1
    ),
    dead as (
      update public.malware_scan_jobs
      set
        status = 'dead_letter',
        last_error = coalesce(last_error, 'Max attempts reached from running state'),
        finished_at = coalesce(finished_at, now()),
        next_retry_at = null
      where status = 'running'
        and started_at < now() - (${runningTimeout}::text || ' minutes')::interval
        and attempts >= ${maxAttempts}::int
      returning 1
    )
    select
      (select count(*)::int from requeue) as requeued,
      (select count(*)::int from dead) as dead
  `) as unknown as Array<{ requeued: number; dead: number }>;

  const retriedErrors = (await sql`
    with u as (
      update public.malware_scan_jobs
      set
        status = 'queued',
        started_at = null,
        next_retry_at = null
      where status = 'error'
        and attempts < ${maxAttempts}::int
        and (
          next_retry_at is null
          or next_retry_at <= now()
          or coalesce(finished_at, created_at) <= now() - (
            least(
              ${retryMax}::int,
              ${retryBase}::int * (2 ^ greatest(attempts - 1, 0))
            )::text || ' minutes'
          )::interval
        )
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
    retryBase,
    retryMax,
    staleRequeued: Number(staleRunning?.[0]?.requeued ?? 0),
    staleDeadLettered: Number(staleRunning?.[0]?.dead ?? 0),
    errorRequeued: Number(retriedErrors?.[0]?.c ?? 0),
    maxAttemptJobs: Number(saturated?.[0]?.c ?? 0),
  };
}
