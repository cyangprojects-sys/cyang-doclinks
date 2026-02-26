import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { sql } from "@/lib/db";
import { setActiveMasterKey } from "@/lib/masterKeys";
import { logSecurityEvent } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  change_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
