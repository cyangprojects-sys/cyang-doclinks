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
