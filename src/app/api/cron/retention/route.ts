export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { runRetention } from "@/lib/retention";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";
import { logCronRun } from "@/lib/cronTelemetry";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:cron_retention",
    limit: Number(process.env.RATE_LIMIT_CRON_RETENTION_PER_MIN || 20),
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
    const retention = await runRetention();
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "retention",
      ok: true,
      durationMs: duration,
      meta: { retention },
    });
    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      duration_ms: duration,
      retention,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "retention",
      ok: false,
      durationMs: duration,
      meta: { error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_RETENTION_FAILED" }, { status: 500 });
  }
}
