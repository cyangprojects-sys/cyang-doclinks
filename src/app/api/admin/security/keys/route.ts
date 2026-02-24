import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { listMasterKeysWithStatus, isMasterKeyRevoked } from "@/lib/masterKeys";
import { getActiveMasterKey } from "@/lib/encryption";

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
    const configured = keys.length > 0 && !!activeId;
    const revoked_active = activeId ? await isMasterKeyRevoked(activeId) : false;

    return NextResponse.json({
      ok: true,
      configured,
      active_key_id: activeId,
      revoked_active,
      keys,
    });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const status = msg === "FORBIDDEN" || msg === "UNAUTHENTICATED" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
