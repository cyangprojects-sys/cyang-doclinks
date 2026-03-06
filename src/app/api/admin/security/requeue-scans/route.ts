import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { resolvePublicAppBaseUrl } from "@/lib/publicBaseUrl";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_REQUEUE_SCANS_BODY_BYTES = 4 * 1024;

function parseBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const size = Number(raw);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export async function POST(req: Request) {
  let appBaseUrl: string;
  try {
    appBaseUrl = resolvePublicAppBaseUrl(req.url);
  } catch {
    return NextResponse.json({ ok: false, error: "ENV_MISCONFIGURED" }, { status: 500 });
  }
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_ADMIN_SECURITY_REQUEUE_SCANS_MS", 20_000);

  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_security_requeue_scans",
          limit: Number(process.env.RATE_LIMIT_ADMIN_SECURITY_REQUEUE_PER_MIN || 30),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.redirect(new URL("/admin/security?error=RATE_LIMIT", appBaseUrl), { status: 303 });
        }
        const u = await requireRole("owner");
        if (parseBodyLength(req) > MAX_REQUEUE_SCANS_BODY_BYTES) {
          return NextResponse.redirect(new URL("/admin/security?error=PAYLOAD_TOO_LARGE", appBaseUrl), { status: 303 });
        }

        const rows = (await sql`
          with candidates as (
            select d.id, d.r2_bucket, d.r2_key
            from public.docs d
            where coalesce(d.status::text, 'ready') <> 'deleted'
              and d.r2_bucket is not null
              and d.r2_key is not null
              and (
                lower(coalesce(d.scan_status::text, 'unscanned')) in ('pending', 'unscanned', 'queued', 'running', 'error', 'quarantined')
                or lower(coalesce(d.moderation_status::text, 'active')) = 'quarantined'
              )
          ),
          upserted as (
            insert into public.malware_scan_jobs (doc_id, r2_bucket, r2_key, status, attempts, next_retry_at, started_at, finished_at, last_error)
            select c.id, c.r2_bucket, c.r2_key, 'queued', 0, null, null, null, null
            from candidates c
            on conflict (doc_id) do update
            set
              status = case
                when public.malware_scan_jobs.status in ('clean', 'infected', 'error', 'dead_letter', 'skipped') then 'queued'
                when public.malware_scan_jobs.status = 'running'
                  and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
                  then 'queued'
                else public.malware_scan_jobs.status
              end,
              attempts = case
                when public.malware_scan_jobs.status in ('clean', 'infected', 'error', 'dead_letter', 'skipped') then 0
                when public.malware_scan_jobs.status = 'running'
                  and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
                  then 0
                else public.malware_scan_jobs.attempts
              end,
              next_retry_at = case
                when public.malware_scan_jobs.status in ('clean', 'infected', 'error', 'dead_letter', 'skipped') then null
                when public.malware_scan_jobs.status = 'running'
                  and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
                  then null
                else public.malware_scan_jobs.next_retry_at
              end,
              started_at = case
                when public.malware_scan_jobs.status in ('clean', 'infected', 'error', 'dead_letter', 'skipped') then null
                when public.malware_scan_jobs.status = 'running'
                  and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
                  then null
                else public.malware_scan_jobs.started_at
              end,
              finished_at = case
                when public.malware_scan_jobs.status in ('clean', 'infected', 'error', 'dead_letter', 'skipped') then null
                when public.malware_scan_jobs.status = 'running'
                  and public.malware_scan_jobs.started_at < now() - interval '20 minutes'
                  then null
                else public.malware_scan_jobs.finished_at
              end,
              last_error = case
                when public.malware_scan_jobs.status in ('clean', 'infected', 'error', 'dead_letter', 'skipped') then null
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
            when lower(coalesce(d.moderation_status::text, 'active')) in ('disabled', 'deleted') then d.scan_status
            else 'pending'
          end
          where coalesce(d.status::text, 'ready') <> 'deleted'
            and d.r2_bucket is not null
            and d.r2_key is not null
            and (
              lower(coalesce(d.scan_status::text, 'unscanned')) in ('pending', 'unscanned', 'queued', 'running', 'error', 'quarantined')
              or lower(coalesce(d.moderation_status::text, 'active')) = 'quarantined'
            )
        `;

        void logSecurityEvent({
          type: "malware_scan_requeue_all",
          severity: "medium",
          actorUserId: u.id,
          orgId: u.orgId ?? null,
          scope: "scanner",
          message: "Owner requested rescan for pending and quarantined docs",
          meta: { requeued },
        });

        return NextResponse.redirect(new URL(`/admin/security?saved=scan_requeued&requeued=${requeued}`, appBaseUrl), { status: 303 });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.redirect(new URL("/admin/security?error=TIMEOUT", appBaseUrl), { status: 303 });
    }
    const msg = e instanceof Error ? e.message : "";
    const safeError = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? msg : "requeue_failed";
    return NextResponse.redirect(new URL(`/admin/security?error=${encodeURIComponent(safeError)}`, appBaseUrl), { status: 303 });
  }
}
