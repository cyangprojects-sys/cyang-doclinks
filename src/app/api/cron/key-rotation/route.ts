export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";
import { processKeyRotationJobs } from "@/lib/keyRotationJobs";
import { logCronRun } from "@/lib/cronTelemetry";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:cron_key_rotation",
    limit: Number(process.env.RATE_LIMIT_CRON_KEY_ROTATION_PER_MIN || 30),
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
  const maxJobs = Math.max(1, Math.min(25, Number(process.env.KEY_ROTATION_CRON_MAX_JOBS || 5)));
  try {
    const result = await processKeyRotationJobs({ maxJobs });
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "key-rotation",
      ok: true,
      durationMs: duration,
      meta: { maxJobs, claimed: result.claimed, processed: result.processed },
    });
    return NextResponse.json({ ok: true, duration_ms: duration, ...result });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "key-rotation",
      ok: false,
      durationMs: duration,
      meta: { maxJobs, error: msg },
    });
    return NextResponse.json({ ok: false, error: "CRON_KEY_ROTATION_FAILED" }, { status: 500 });
  }
}
