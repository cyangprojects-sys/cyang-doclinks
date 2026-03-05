export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";
import { runBillingMaintenance } from "@/lib/billingSubscription";
import { logCronRun } from "@/lib/cronTelemetry";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return cronUnauthorizedResponse();
  }

  const startedAt = Date.now();
  try {
    const result = await runBillingMaintenance({
      maxUsers: Math.max(1, Math.min(5000, Number(process.env.BILLING_MAINTENANCE_MAX_USERS || 500))),
    });

    const duration = Date.now() - startedAt;
    if (!result.ok) {
      await logCronRun({
        job: "billing-sync",
        ok: false,
        durationMs: duration,
        meta: { error: "CRON_BILLING_SYNC_FAILED", usersScanned: result.usersScanned ?? null },
      });
      return NextResponse.json({
        ok: false,
        error: "CRON_BILLING_SYNC_FAILED",
        now: new Date().toISOString(),
        duration_ms: duration,
      }, { status: 500 });
    }

    await logCronRun({
      job: "billing-sync",
      ok: true,
      durationMs: duration,
      meta: result,
    });

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      duration_ms: duration,
      billing_sync: result,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e || "failed");
    await logCronRun({
      job: "billing-sync",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_BILLING_SYNC_FAILED" }, { status: 500 });
  }
}
