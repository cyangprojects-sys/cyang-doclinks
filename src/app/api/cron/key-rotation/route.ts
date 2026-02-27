export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { processKeyRotationJobs } from "@/lib/keyRotationJobs";
import { logCronRun } from "@/lib/cronTelemetry";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
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
