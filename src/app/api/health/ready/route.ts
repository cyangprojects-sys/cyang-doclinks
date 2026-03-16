export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { buildReadinessSummary, summarizeHealthChecks } from "@/lib/health";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";

export async function GET(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_HEALTH_MS", 3_000);
  try {
    return await withRouteTimeout(
      (async () => {
        const rl = await enforceGlobalApiRateLimit({
          req,
          scope: "ip:health",
          limit: Number(process.env.RATE_LIMIT_HEALTH_IP_PER_MIN || 300),
          windowSeconds: 60,
          strict: true,
        });
        if (!rl.ok) {
          return NextResponse.json(
            { ok: false, error: "RATE_LIMIT" },
            { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
          );
        }

        const summary = await buildReadinessSummary();
        const readiness = summarizeHealthChecks(summary.checks);
        return NextResponse.json(summary, { status: readiness.httpStatus });
      })(),
      timeoutMs
    );
  } catch (error: unknown) {
    if (isRouteTimeoutError(error)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
