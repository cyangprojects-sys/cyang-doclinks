// app/api/health/route.ts
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { getCachedDependencySummary, summarizeHealthChecks, toExternalHealthSummary } from "@/lib/health";
import { withRequestTelemetry } from "@/lib/perfTelemetry";
import { jsonError, jsonRateLimitError } from "@/lib/apiResponses";

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
          return jsonRateLimitError(rl.status, rl.retryAfterSeconds);
        }

        const summary = await getCachedDependencySummary();
        const readiness = summarizeHealthChecks(summary.checks);

        return NextResponse.json(toExternalHealthSummary(summary), { status: readiness.httpStatus });
        })(),
        timeoutMs
      ),
      { routeKey: "/api/health" }
    );
  } catch (e: unknown) {
    if (isRouteTimeoutError(e)) {
      return jsonError("TIMEOUT", 504);
    }
    return jsonError("SERVER_ERROR", 500);
  }
}
