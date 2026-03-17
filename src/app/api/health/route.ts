// app/api/health/route.ts
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { getCachedDependencySummary, summarizeHealthChecks } from "@/lib/health";
import { withRequestTelemetry } from "@/lib/perfTelemetry";

export async function GET(req: NextRequest) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_HEALTH_MS", 3_000);
  try {
    return await withRequestTelemetry(
      req,
      () => withRouteTimeout(
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

        const summary = await getCachedDependencySummary();
        const readiness = summarizeHealthChecks(summary.checks);

        return NextResponse.json(summary, { status: readiness.httpStatus });
        })(),
        timeoutMs
      ),
      { routeKey: "/api/health" }
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return NextResponse.json({ ok: false, error: "TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
