export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { aggregateDocViewDaily, envInt } from "@/lib/analytics";

export async function GET() {
  await requireRole("admin");

  // How far back we recompute daily aggregates.
  // Keep this relatively small; re-running daily is cheap.
  const daysBack = envInt("ANALYTICS_AGGREGATE_DAYS_BACK", 120);

  try {
    const res = await aggregateDocViewDaily({ daysBack });
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint:
          "Ensure public.doc_view_daily exists (scripts/sql/doc_view_daily.sql) and public.doc_views exists.",
      },
      { status: 500 }
    );
  }
}
