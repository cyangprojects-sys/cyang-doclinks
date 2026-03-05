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
    const duration = Date.now() - startedAt;
    if (!res.ok) {
      await logCronRun({
        job: "webhooks",
        ok: false,
        durationMs: duration,
        meta: { error: res.error || "CRON_WEBHOOKS_FAILED" },
      });
      return NextResponse.json({ ok: false, error: "CRON_WEBHOOKS_FAILED", now: new Date().toISOString(), duration_ms: duration }, { status: 500 });
    }

    await logCronRun({
      job: "webhooks",
      ok: true,
      durationMs: duration,
      meta: {
        processed: res.processed,
        succeeded: res.succeeded,
        dead: res.dead,
        failed: res.failed,
      },
    });
    return NextResponse.json({
      ...res,
      now: new Date().toISOString(),
      duration_ms: duration,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "webhooks",
      ok: false,
      durationMs: duration,
      meta: { error: "CRON_WEBHOOKS_FAILED" },
    });
    return NextResponse.json({ ok: false, error: "CRON_WEBHOOKS_FAILED" }, { status: 500 });
  }
}
