import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/rbac";
import { revokeMasterKey } from "@/lib/masterKeys";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_SECURITY_REVOKE_BODY_BYTES = 8 * 1024;

const Body = z.object({
  key_id: z.string().trim().regex(KEY_ID_RE),
}).strict();

function parseJsonBodyLength(req: Request): number {
  const raw = String(req.headers.get("content-length") || "").trim();
  const out = Number(raw);
  return Number.isFinite(out) ? Math.max(0, Math.floor(out)) : 0;
}

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const message = e instanceof Error ? e.message : String(e || "");
  if (message === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (message === "FORBIDDEN") return "FORBIDDEN";
  return null;
}

export async function POST(req: Request) {
  try {
    if (parseJsonBodyLength(req) > MAX_SECURITY_REVOKE_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
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
  } catch (e: unknown) {
    const authCode = authErrorCode(e);
    if (authCode === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (authCode === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
