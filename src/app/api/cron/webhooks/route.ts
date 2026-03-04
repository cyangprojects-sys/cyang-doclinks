export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";
import { processWebhookDeliveries } from "@/lib/webhooks";
import { logCronRun } from "@/lib/cronTelemetry";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return cronUnauthorizedResponse();
  }

  const startedAt = Date.now();
  try {
    const res = await processWebhookDeliveries({ maxBatch: 25, maxAttempts: 8 });
    const resObj = (res && typeof res === "object" ? res : {}) as Record<string, unknown>;
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "webhooks",
      ok: true,
      durationMs: duration,
      meta: {
        attempted: resObj.attempted ?? null,
        delivered: resObj.delivered ?? null,
        failed: resObj.failed ?? null,
      },
    });
    return NextResponse.json({
      ...res,
      now: new Date().toISOString(),
      duration_ms: duration,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "webhooks",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_WEBHOOKS_FAILED" }, { status: 500 });
  }
}
