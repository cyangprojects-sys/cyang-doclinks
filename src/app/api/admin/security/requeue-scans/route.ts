import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const u = await requireRole("owner");

    const rows = (await sql`
      with candidates as (
        select d.id, d.r2_bucket, d.r2_key
        from public.docs d
        where coalesce(d.status::text, 'ready') <> 'deleted'
          and d.r2_bucket is not null
          and d.r2_key is not null
          and lower(coalesce(d.scan_status::text, 'unscanned')) in ('pending', 'unscanned', 'queued', 'running', 'error')
      ),
      upserted as (
        insert into public.malware_scan_jobs (doc_id, r2_bucket, r2_key, status, attempts, next_retry_at, started_at, finished_at, last_error)
        select c.id, c.r2_bucket, c.r2_key, 'queued', 0, null, null, null, null
        from candidates c
        on conflict (doc_id) do update
        set
          status = case
            when public.malware_scan_jobs.status in ('error', 'dead_letter', 'skipped') then 'queued'
            when public.malware_scan_jobs.status = 'running'
              and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
              then 'queued'
            else public.malware_scan_jobs.status
          end,
          attempts = case
            when public.malware_scan_jobs.status in ('error', 'dead_letter', 'skipped') then 0
            when public.malware_scan_jobs.status = 'running'
              and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
              then 0
            else public.malware_scan_jobs.attempts
          end,
          next_retry_at = case
            when public.malware_scan_jobs.status in ('error', 'dead_letter', 'skipped') then null
            when public.malware_scan_jobs.status = 'running'
              and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
              then null
            else public.malware_scan_jobs.next_retry_at
          end,
          started_at = case
            when public.malware_scan_jobs.status in ('error', 'dead_letter', 'skipped') then null
            when public.malware_scan_jobs.status = 'running'
              and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
              then null
            else public.malware_scan_jobs.started_at
          end,
          finished_at = case
            when public.malware_scan_jobs.status in ('error', 'dead_letter', 'skipped') then null
            when public.malware_scan_jobs.status = 'running'
              and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
              then null
            else public.malware_scan_jobs.finished_at
          end,
          last_error = case
            when public.malware_scan_jobs.status in ('error', 'dead_letter', 'skipped') then null
            when public.malware_scan_jobs.status = 'running'
              and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
              then null
            else public.malware_scan_jobs.last_error
          end
        returning doc_id
      )
      select count(*)::int as requeued
      from upserted
    `) as unknown as Array<{ requeued: number }>;

    const requeued = Number(rows?.[0]?.requeued ?? 0);

    await sql`
      update public.docs d
      set scan_status = case
        when lower(coalesce(d.moderation_status::text, 'active')) in ('disabled', 'quarantined', 'deleted') then d.scan_status
        else 'pending'
      end
      where d.id in (
        select msj.doc_id
        from public.malware_scan_jobs msj
      )
        and lower(coalesce(d.scan_status::text, 'unscanned')) in ('pending', 'unscanned', 'queued', 'running', 'error')
    `;

    void logSecurityEvent({
      type: "malware_scan_requeue_all",
      severity: "medium",
      actorUserId: u.id,
      orgId: u.orgId ?? null,
      scope: "scanner",
      message: "Owner requeued pending scan jobs",
      meta: { requeued },
    });

    return NextResponse.redirect(new URL(`/admin/security?saved=scan_requeued&requeued=${requeued}`, req.url), { status: 303 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    const safeError = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? msg : "requeue_failed";
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(safeError)}`, req.url), { status: 303 });
  }
}

