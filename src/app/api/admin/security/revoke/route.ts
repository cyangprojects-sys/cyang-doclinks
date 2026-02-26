import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { revokeMasterKey } from "@/lib/masterKeys";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  key_id: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const u = await requirePermission("security.keys.manage");
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    await revokeMasterKey({ id: parsed.data.key_id, actorUserId: u.id });

    try {
      await appendImmutableAudit({
        streamKey: "security:key-management",
        action: "encryption.key.revoke",
        actorUserId: u.id,
        subjectId: parsed.data.key_id,
        payload: {
          keyId: parsed.data.key_id,
        },
      });
    } catch {
      // ignore immutable audit failures to avoid blocking control-plane operation
    }

    void logSecurityEvent({
      type: "master_key_revoke",
      severity: "high",
      actorUserId: u.id,
      orgId: u.orgId ?? null,
      scope: "crypto",
      message: "Master key revoked",
      meta: { keyId: parsed.data.key_id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
