export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { aggregateDocViewDaily, envInt } from "@/lib/analytics";
import { getPlanForUser } from "@/lib/monetization";

export async function GET() {
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
    return NextResponse.json(
      {
        ok: false,
        error: "SERVER_ERROR",
        hint:
          "Ensure public.doc_view_daily exists (scripts/sql/doc_view_daily.sql) and public.doc_views exists.",
      },
      { status: 500 }
    );
  }
}
