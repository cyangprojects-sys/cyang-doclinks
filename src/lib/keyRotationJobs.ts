import { sql } from "@/lib/db";
import { countDocsEncryptedWithKey, rotateDocKeys } from "@/lib/masterKeys";

export type KeyRotationJob = {
  id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  requested_by_user_id: string | null;
  from_key_id: string;
  to_key_id: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  scanned_count: number;
  rotated_count: number;
  failed_count: number;
  max_batch: number;
  last_error: string | null;
};

async function jobsTableExists(): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass('public.key_rotation_jobs')::text as reg`) as unknown as Array<{ reg: string | null }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export async function enqueueKeyRotationJob(args: {
  fromKeyId: string;
  toKeyId: string;
  maxBatch?: number;
  requestedByUserId?: string | null;
}): Promise<{ id: string }> {
  if (!(await jobsTableExists())) throw new Error("MISSING_KEY_ROTATION_JOBS_TABLE");
  const maxBatch = Math.max(1, Math.min(2000, Number(args.maxBatch ?? 250)));
  const rows = (await sql`
    insert into public.key_rotation_jobs
      (from_key_id, to_key_id, status, max_batch, requested_by_user_id)
    values
      (${args.fromKeyId}, ${args.toKeyId}, 'queued', ${maxBatch}::int, ${args.requestedByUserId ?? null}::uuid)
    returning id::text as id
  `) as unknown as Array<{ id: string }>;
  const id = rows?.[0]?.id;
  if (!id) throw new Error("INSERT_FAILED");
  return { id };
}

export async function listKeyRotationJobs(limit: number = 30): Promise<KeyRotationJob[]> {
  if (!(await jobsTableExists())) return [];
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  try {
    return (await sql`
      select
        id::text as id,
        created_at::text as created_at,
        started_at::text as started_at,
        finished_at::text as finished_at,
        requested_by_user_id::text as requested_by_user_id,
        from_key_id::text as from_key_id,
        to_key_id::text as to_key_id,
        status::text as status,
        scanned_count::int as scanned_count,
        rotated_count::int as rotated_count,
        failed_count::int as failed_count,
        max_batch::int as max_batch,
        last_error::text as last_error
      from public.key_rotation_jobs
      order by created_at desc
      limit ${safeLimit}
    `) as unknown as KeyRotationJob[];
  } catch {
    return [];
  }
}

async function claimNextKeyRotationJob(): Promise<KeyRotationJob | null> {
  const rows = (await sql`
    with next_job as (
      select id
      from public.key_rotation_jobs
      where status in ('running', 'queued')
      order by
        case when status = 'running' then 0 else 1 end,
        created_at asc
      limit 1
      for update skip locked
    )
    update public.key_rotation_jobs j
    set
      status = 'running',
      started_at = coalesce(j.started_at, now()),
      last_error = null
    from next_job n
    where j.id = n.id
    returning
      j.id::text as id,
      j.created_at::text as created_at,
      j.started_at::text as started_at,
      j.finished_at::text as finished_at,
      j.requested_by_user_id::text as requested_by_user_id,
      j.from_key_id::text as from_key_id,
      j.to_key_id::text as to_key_id,
      j.status::text as status,
      j.scanned_count::int as scanned_count,
      j.rotated_count::int as rotated_count,
      j.failed_count::int as failed_count,
      j.max_batch::int as max_batch,
      j.last_error::text as last_error
  `) as unknown as KeyRotationJob[];
  return rows?.[0] ?? null;
}

export async function processKeyRotationJobs(args?: { maxJobs?: number }) {
  if (!(await jobsTableExists())) return { claimed: 0, processed: 0, results: [] as Array<Record<string, unknown>> };

  const maxJobs = Math.max(1, Math.min(25, Number(args?.maxJobs ?? 5)));
  let claimed = 0;
  let processed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (let i = 0; i < maxJobs; i += 1) {
    const job = await claimNextKeyRotationJob();
    if (!job) break;
    claimed += 1;

    try {
      const res = await rotateDocKeys({
        fromKeyId: job.from_key_id,
        toKeyId: job.to_key_id,
        limit: job.max_batch,
      });

      const totalScanned = Number(job.scanned_count ?? 0) + res.scanned;
      const totalRotated = Number(job.rotated_count ?? 0) + res.rotated;
      const totalFailed = Number(job.failed_count ?? 0) + res.failed;
      const done = res.remaining <= 0;

      await sql`
        update public.key_rotation_jobs
        set
          scanned_count = ${totalScanned}::int,
          rotated_count = ${totalRotated}::int,
          failed_count = ${totalFailed}::int,
          status = ${done ? "completed" : "running"}::text,
          finished_at = case when ${done} then now() else null end,
          last_error = null
        where id = ${job.id}::uuid
      `;

      processed += 1;
      results.push({
        id: job.id,
        ok: true,
        scanned: res.scanned,
        rotated: res.rotated,
        failed: res.failed,
        remaining: res.remaining,
        status: done ? "completed" : "running",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql`
        update public.key_rotation_jobs
        set
          status = 'failed',
          finished_at = now(),
          last_error = ${msg}
        where id = ${job.id}::uuid
      `;
      processed += 1;
      results.push({ id: job.id, ok: false, error: msg });
    }
  }

  return { claimed, processed, results };
}

export async function getKeyRotationStatusSummary() {
  if (!(await jobsTableExists())) return { queued: 0, running: 0, failed: 0 };
  const rows = (await sql`
    select
      count(*) filter (where status = 'queued')::int as queued,
      count(*) filter (where status = 'running')::int as running,
      count(*) filter (where status = 'failed')::int as failed
    from public.key_rotation_jobs
  `) as unknown as Array<{ queued: number; running: number; failed: number }>;
  return rows?.[0] ?? { queued: 0, running: 0, failed: 0 };
}

export async function estimateRollbackImpact(args: { fromKeyId: string; toKeyId: string }) {
  const nowOnTo = await countDocsEncryptedWithKey(args.toKeyId);
  const stillOnFrom = await countDocsEncryptedWithKey(args.fromKeyId);
  return { nowOnTo, stillOnFrom };
}
