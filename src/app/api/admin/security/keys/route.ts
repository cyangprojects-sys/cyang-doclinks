import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { listMasterKeysWithStatus, isMasterKeyRevoked, getDbActiveMasterKeyId, listRecentMasterKeyChanges } from "@/lib/masterKeys";
import { getActiveMasterKey } from "@/lib/encryption";
import { listKeyRotationJobs, getKeyRotationStatusSummary } from "@/lib/keyRotationJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("owner");

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
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
