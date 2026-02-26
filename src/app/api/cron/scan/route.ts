// src/app/api/cron/scan/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { sql } from "@/lib/db";
import { scanR2Object } from "@/lib/malwareScan";
import { logSecurityEvent } from "@/lib/securityTelemetry";

type Job = {
  id: string;
  doc_id: string;
  r2_bucket: string;
  r2_key: string;
  attempts: number;
};

const SCANNER_VERSION = "v1-vt-hash-lookup";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const maxJobs = Math.max(1, Math.min(25, Number(process.env.SCAN_CRON_BATCH || 10)));
  const absMaxBytes = Math.max(1024 * 1024, Number(process.env.SCAN_ABS_MAX_BYTES || 25_000_000)); // default 25MB

  // Claim jobs using SKIP LOCKED to avoid concurrent cron overlap.
  const jobs = (await sql`
    with picked as (
      select id, doc_id, r2_bucket, r2_key, attempts
      from public.malware_scan_jobs
      where status = 'queued'
      order by created_at asc
      limit ${maxJobs}
      for update skip locked
    )
    update public.malware_scan_jobs j
      set status = 'running',
          attempts = j.attempts + 1,
          started_at = coalesce(j.started_at, now()),
          scanner_version = ${SCANNER_VERSION}
    from picked p
    where j.id = p.id
    returning j.id::text as id, j.doc_id::text as doc_id, j.r2_bucket::text as r2_bucket, j.r2_key::text as r2_key, j.attempts::int as attempts
  `) as unknown as Job[];

  const results: any[] = [];
  for (const job of jobs) {
    try {
      const verdict = await scanR2Object({
        bucket: job.r2_bucket,
        key: job.r2_key,
        absMaxBytes,
      });

      const isHigh = verdict.riskLevel === "high";
      const scanStatus =
        verdict.verdict === "infected"
          ? "quarantined"
          : verdict.verdict === "clean"
          ? "clean"
          : "risky";

      // Update doc (trigger will auto-quarantine on risk_level='high')
      await sql`
        update public.docs
        set
          scan_status = ${scanStatus}::text,
          risk_level = ${verdict.riskLevel}::text,
          risk_flags = ${JSON.stringify({ flags: verdict.flags, meta: verdict.meta ?? null, source: "malware_scan" })}::jsonb
        where id = ${job.doc_id}::uuid
      `;

      // Update job
      await sql`
        update public.malware_scan_jobs
        set
          status = ${verdict.verdict === "infected" ? "infected" : verdict.verdict === "clean" ? "clean" : "skipped"}::text,
          finished_at = now(),
          sha256 = ${verdict.sha256},
          result = ${JSON.stringify(verdict)}::jsonb,
          last_error = null
        where id = ${job.id}::uuid
      `;

      if (isHigh) {
        await logSecurityEvent({
          type: "malware_scan_high_risk_quarantine",
          severity: "high",
          scope: "scanner",
          docId: job.doc_id,
          message: "Doc auto-quarantined due to high-risk malware scan verdict",
          meta: { jobId: job.id, sha256: verdict.sha256, flags: verdict.flags },
        });
      }

      results.push({ id: job.id, ok: true, verdict: verdict.verdict, riskLevel: verdict.riskLevel });
    } catch (e: any) {
      const msg = String(e?.message || e);

      await sql`
        update public.malware_scan_jobs
        set
          status = 'error',
          finished_at = now(),
          last_error = ${msg}
        where id = ${job.id}::uuid
      `;

      results.push({ id: job.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, claimed: jobs.length, results });
}
