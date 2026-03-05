export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";
import { processWebhookDeliveries } from "@/lib/webhooks";
import { logCronRun } from "@/lib/cronTelemetry";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:cron_webhooks",
    limit: Number(process.env.RATE_LIMIT_CRON_WEBHOOKS_PER_MIN || 30),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

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
