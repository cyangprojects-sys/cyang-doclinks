export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { runRetention } from "@/lib/retention";
import { isCronAuthorized } from "@/lib/cronAuth";
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
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
