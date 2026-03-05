import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { listMasterKeysWithStatus, isMasterKeyRevoked, getDbActiveMasterKeyId, listRecentMasterKeyChanges } from "@/lib/masterKeys";
import { getActiveMasterKey } from "@/lib/encryption";
import { listKeyRotationJobs, getKeyRotationStatusSummary } from "@/lib/keyRotationJobs";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authErrorCode(e: unknown): "UNAUTHENTICATED" | "FORBIDDEN" | null {
  const message = e instanceof Error ? e.message : String(e || "");
  if (message === "UNAUTHENTICATED") return "UNAUTHENTICATED";
  if (message === "FORBIDDEN") return "FORBIDDEN";
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const rl = await enforceGlobalApiRateLimit({
      req,
      scope: "ip:admin_security_keys",
      limit: Number(process.env.RATE_LIMIT_ADMIN_SECURITY_KEYS_PER_MIN || 60),
      windowSeconds: 60,
      strict: true,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMIT" },
        { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    await requirePermission("security.keys.manage");

    let activeId: string | null = null;
    try {
      activeId = getActiveMasterKey().id;
    } catch {
      activeId = null;
    }

    const keys = await listMasterKeysWithStatus();
    const dbActiveId = await getDbActiveMasterKeyId();
    const configured = keys.length > 0 && !!activeId;
    const revoked_active = activeId ? await isMasterKeyRevoked(activeId) : false;
    const changes = await listRecentMasterKeyChanges(20);
    const jobs = await listKeyRotationJobs(20);
    const jobSummary = await getKeyRotationStatusSummary();

    return NextResponse.json({
      ok: true,
      configured,
      active_key_id: activeId,
      db_active_key_id: dbActiveId,
      revoked_active,
      keys,
      changes,
      jobs,
      job_summary: jobSummary,
    });
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
