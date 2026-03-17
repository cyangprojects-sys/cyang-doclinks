export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { runRetention } from "@/lib/retention";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_retention_run",
    limit: Number(process.env.RATE_LIMIT_ADMIN_RETENTION_RUN_PER_MIN || 10),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }
  await requirePermission("retention.run");

  const res = await runRetention();
  return NextResponse.json({ ok: true, now: new Date().toISOString(), ...res });
}
