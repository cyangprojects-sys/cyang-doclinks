export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
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

  // Optional query param: ?daysBack=120
  const url = new URL(req.url);
  const daysBackRaw = (url.searchParams.get("daysBack") || "").trim();
  const daysBack = daysBackRaw ? Math.max(1, Math.min(3650, Number(daysBackRaw) || 0)) : undefined;

  try {
    const aggregate = await aggregateDocViewDaily(daysBack ? { daysBack: Math.floor(daysBack) } : undefined);
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "aggregate",
      ok: true,
      durationMs: duration,
      meta: { aggregated: (aggregate as any)?.aggregated ?? null, daysBack: daysBack ?? null },
    });
    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      duration_ms: duration,
      aggregate,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    await logCronRun({
      job: "aggregate",
      ok: false,
      durationMs: duration,
      meta: { error: msg, daysBack: daysBack ?? null },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
