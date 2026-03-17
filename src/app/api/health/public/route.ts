export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { getCachedPublicHealthSnapshot } from "@/lib/health";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { withRequestTelemetry } from "@/lib/perfTelemetry";

const PUBLIC_STATUS_S_MAXAGE = 300;
const PUBLIC_STATUS_STALE_WHILE_REVALIDATE = 900;

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
            {
              status: rl.status,
              headers: {
                "Retry-After": String(rl.retryAfterSeconds),
                "Cache-Control": "no-store",
              },
            }
          );
        }

        const snapshot = await getCachedPublicHealthSnapshot();
        return NextResponse.json(snapshot, {
          headers: {
            "Cache-Control": `public, s-maxage=${PUBLIC_STATUS_S_MAXAGE}, stale-while-revalidate=${PUBLIC_STATUS_STALE_WHILE_REVALIDATE}`,
          },
        });
        })(),
        timeoutMs
      ),
      { routeKey: "/api/health/public" }
    );
  } catch (error: unknown) {
    if (isRouteTimeoutError(error)) {
      return NextResponse.json(
        { ok: false, error: "TIMEOUT" },
        { status: 504, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
