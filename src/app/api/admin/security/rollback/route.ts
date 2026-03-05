import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { setActiveMasterKey } from "@/lib/masterKeys";
import { enforceGlobalApiRateLimit, logSecurityEvent } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  change_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
const MAX_SECURITY_ROLLBACK_BODY_BYTES = 8 * 1024;

function parseJsonBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

export async function POST(req: Request) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_ADMIN_SECURITY_ROLLBACK_MS", 20_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:admin_security_rollback",
          limit: Number(process.env.RATE_LIMIT_ADMIN_SECURITY_KEY_OPS_PER_MIN || 120),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }
        if (parseJsonBodyLength(req) > MAX_SECURITY_ROLLBACK_BODY_BYTES) {
          return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
        }
        const u = await requirePermission("security.keys.manage");
        const json = await req.json().catch(() => null);
        const parsed = Body.safeParse(json);
        if (!parsed.success) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

        const rows = (await sql`
          select
            id::text as id,
            previous_key_id::text as previous_key_id,
            new_key_id::text as new_key_id
          from public.master_key_changes
          where id = ${parsed.data.change_id}::uuid
          limit 1
        `) as unknown as Array<{ id: string; previous_key_id: string | null; new_key_id: string }>;

        const row = rows?.[0];
        if (!row) return NextResponse.json({ ok: false, error: "CHANGE_NOT_FOUND" }, { status: 404 });
        if (!row.previous_key_id) {
          return NextResponse.json({ ok: false, error: "NO_ROLLBACK_TARGET" }, { status: 400 });
        }

        await setActiveMasterKey({
          keyId: row.previous_key_id,
          actorUserId: u.id,
          reason: parsed.data.reason ?? `Rollback of change ${row.id}`,
          rollbackOfChangeId: row.id,
        });

        try {
          await appendImmutableAudit({
            streamKey: "security:key-management",
            action: "encryption.key.rollback",
            actorUserId: u.id,
            subjectId: row.id,
            payload: {
              changeId: row.id,
              fromKeyId: row.new_key_id,
              toKeyId: row.previous_key_id,
              reason: parsed.data.reason ?? null,
            },
          });
        } catch {
          // ignore immutable audit failures to avoid blocking control-plane operation
        }

        void logSecurityEvent({
          type: "master_key_rollback",
          severity: "high",
          actorUserId: u.id,
          orgId: u.orgId ?? null,
          scope: "crypto",
          message: "Master key change rolled back",
          meta: { changeId: row.id, from: row.new_key_id, to: row.previous_key_id },
        });

        return NextResponse.json({ ok: true, restored_key_id: row.previous_key_id });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: status === 403 ? "FORBIDDEN" : "SERVER_ERROR" }, { status });
  }
}
