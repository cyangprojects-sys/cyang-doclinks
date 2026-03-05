export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { aggregateDocViewDaily } from "@/lib/analytics";
import { cronUnauthorizedResponse, isCronAuthorized } from "@/lib/cronAuth";
import { logCronRun } from "@/lib/cronTelemetry";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:cron_aggregate",
    limit: Number(process.env.RATE_LIMIT_CRON_AGGREGATE_PER_MIN || 30),
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

  // Optional query param: ?daysBack=120
  const url = new URL(req.url);
  const daysBackRaw = (url.searchParams.get("daysBack") || "").trim();
  if (daysBackRaw && !/^\d{1,4}$/.test(daysBackRaw)) {
    return NextResponse.json({ ok: false, error: "INVALID_DAYS_BACK" }, { status: 400 });
  }
  const daysBackNum = daysBackRaw ? Number(daysBackRaw) : NaN;
  const daysBack =
    daysBackRaw && Number.isFinite(daysBackNum)
      ? Math.max(1, Math.min(3650, Math.floor(daysBackNum)))
      : undefined;

  try {
    const aggregate = await aggregateDocViewDaily(daysBack ? { daysBack: Math.floor(daysBack) } : undefined);
    const duration = Date.now() - startedAt;
    const aggregateMeta =
      typeof aggregate === "object" && aggregate !== null && "aggregated" in aggregate
        ? (aggregate as { aggregated?: unknown }).aggregated
        : null;
    await logCronRun({
      job: "aggregate",
      ok: true,
      durationMs: duration,
      meta: { aggregated: aggregateMeta ?? null, daysBack: daysBack ?? null },
    });
    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      duration_ms: duration,
      aggregate,
    });
  } catch (e: unknown) {
    const duration = Date.now() - startedAt;
    await logCronRun({
      job: "aggregate",
      ok: false,
      durationMs: duration,
      meta: { error: "CRON_AGGREGATE_FAILED", daysBack: daysBack ?? null },
    });
    return NextResponse.json({ ok: false, error: "CRON_AGGREGATE_FAILED" }, { status: 500 });
  }
}
