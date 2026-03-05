export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/authz";
import { aggregateDocViewDaily, envInt } from "@/lib/analytics";
import { getPlanForUser } from "@/lib/monetization";
import { enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";

export async function GET(req: NextRequest) {
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:admin_analytics_aggregate",
    limit: Number(process.env.RATE_LIMIT_ADMIN_ANALYTICS_AGGREGATE_PER_MIN || 30),
    windowSeconds: 60,
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const user = await requireRole("admin");
  const plan = await getPlanForUser(user.id);
  if (!plan.allowAdvancedAnalytics) {
    return NextResponse.json(
      { ok: false, error: "PLAN_RESTRICTED", message: "Free tier allows basic analytics only (view count)." },
      { status: 403 }
    );
  }

  // How far back we recompute daily aggregates.
  // Keep this relatively small; re-running daily is cheap.
  const daysBack = envInt("ANALYTICS_AGGREGATE_DAYS_BACK", 120);

  try {
    const res = await aggregateDocViewDaily({ daysBack });
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
