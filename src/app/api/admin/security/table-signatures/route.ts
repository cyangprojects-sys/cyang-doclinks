import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { sql } from "@/lib/db";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { listRolePermissionOverrides, permissionsTableExists } from "@/lib/rbac";
import { listOrgMemberships, listPendingOrgInvites, orgMembershipTablesReady } from "@/lib/orgMembership";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeHash(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((p) => String(p ?? "")).join("|");
}

export async function GET(req: Request) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_ADMIN_SECURITY_TABLE_SIGNATURES_MS", 12_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_security_table_signatures",
          limit: Number(process.env.RATE_LIMIT_ADMIN_SECURITY_TABLE_SIGNATURES_PER_MIN || 120),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json({ ok: false, error: "RATE_LIMIT" }, { status: rl.status });
        }

        const user = await requireRole("owner");

        const securityEventsRows = (await sql`
          with snapshot as (
            select
              id::text as id,
              coalesce(type::text, '') as type,
              coalesce(severity::text, '') as severity,
              coalesce(scope::text, '') as scope,
              coalesce(message::text, '') as message,
              created_at::text as created_at
            from public.security_events
            order by created_at desc
            limit 100
          )
          select coalesce(
            md5(string_agg(snapshot.id || ':' || snapshot.type || ':' || snapshot.severity || ':' || snapshot.scope || ':' || snapshot.message || ':' || snapshot.created_at, '|' order by snapshot.created_at desc, snapshot.id desc)),
            md5('')
          ) as sig
          from snapshot
        `) as unknown as Array<{ sig: string }>;
        const securityEvents = String(securityEventsRows?.[0]?.sig || "");

        let deadLetter = "";
        try {
          const rows = (await sql`
            with snapshot as (
              select
                id::text as id,
                coalesce(status::text, '') as status,
                coalesce(attempts::text, '') as attempts,
                coalesce(finished_at::text, '') as finished_at,
                coalesce(last_error::text, '') as last_error
              from public.malware_scan_jobs
              where status = 'dead_letter'
              order by finished_at desc nulls last, created_at desc
              limit 100
            )
            select coalesce(
              md5(string_agg(snapshot.id || ':' || snapshot.status || ':' || snapshot.attempts || ':' || snapshot.finished_at || ':' || snapshot.last_error, '|' order by snapshot.finished_at desc, snapshot.id desc)),
              md5('')
            ) as sig
            from snapshot
          `) as unknown as Array<{ sig: string }>;
          deadLetter = String(rows?.[0]?.sig || "");
        } catch {
          deadLetter = "n/a";
        }

        const quarantinedRows = (await sql`
          with snapshot as (
            select
              d.id::text as id,
              coalesce(d.scan_status::text, 'unscanned') as scan_status,
              coalesce(d.moderation_status::text, 'active') as moderation_status,
              coalesce(d.risk_level::text, '') as risk_level
            from public.docs d
            where coalesce(d.status::text, 'ready') <> 'deleted'
              and lower(coalesce(d.scan_status::text, 'unscanned')) <> 'clean'
              and (
                lower(coalesce(d.scan_status::text, 'unscanned')) = 'quarantined'
                or lower(coalesce(d.moderation_status::text, 'active')) = 'quarantined'
              )
            order by d.created_at desc
            limit 200
          )
          select coalesce(
            md5(string_agg(snapshot.id || ':' || snapshot.scan_status || ':' || snapshot.moderation_status || ':' || snapshot.risk_level, '|' order by snapshot.id)),
            md5('')
          ) as sig
          from snapshot
        `) as unknown as Array<{ sig: string }>;
        const quarantinedDocs = String(quarantinedRows?.[0]?.sig || "");

        let orgMembership = "n/a";
        try {
          if (user.orgId && (await orgMembershipTablesReady())) {
            const members = await listOrgMemberships(user.orgId);
            const invites = await listPendingOrgInvites(user.orgId);
            const membershipSig = makeHash(
              members.map((m) => `${m.user_id}:${m.role}:${m.joined_at}`).concat(invites.map((i) => `${i.id}:${i.email}:${i.role}:${i.expires_at}`))
            );
            orgMembership = membershipSig;
          }
        } catch {
          orgMembership = "n/a";
        }

        let rbacOverrides = "n/a";
        try {
          if (await permissionsTableExists()) {
            const overrides = await listRolePermissionOverrides();
            rbacOverrides = makeHash(overrides.map((o) => `${o.permission}:${o.role}:${o.allowed ? "1" : "0"}`));
          }
        } catch {
          rbacOverrides = "n/a";
        }

        return NextResponse.json({
          ok: true,
          signatures: {
            securityEvents,
            deadLetter,
            quarantinedDocs,
            orgMembership,
            rbacOverrides,
          },
        });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "FORBIDDEN") return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
