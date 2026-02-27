export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { runBillingMaintenance } from "@/lib/billingSubscription";
import { logCronRun } from "@/lib/cronTelemetry";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNAUTHORIZED",
        hint:
          "Set CRON_SECRET in Vercel env vars. Vercel will send it as the Authorization header for cron invocations.",
      },
      { status: 401 }
    );
  }

  const startedAt = Date.now();
  try {
    const result = await runBillingMaintenance({
      maxUsers: Math.max(1, Math.min(5000, Number(process.env.BILLING_MAINTENANCE_MAX_USERS || 500))),
    });

    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "billing-sync",
      ok: Boolean(result.ok),
      durationMs: duration,
      meta: result,
    });

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      duration_ms: duration,
      billing_sync: result,
    });
  } catch (e: any) {
    const duration = Date.now() - startedAt;
    const msg = String(e?.message || e || "failed");
    await logCronRun({
      job: "billing-sync",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

