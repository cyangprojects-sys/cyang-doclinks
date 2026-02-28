export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
<<<<<<< ours
import { requireRole } from "@/lib/authz";
import { aggregateDocViewDaily, envInt } from "@/lib/analytics";
=======
import { requireOwner } from "@/lib/owner";
import { aggregateDocViewsDaily, getAggregateDaysBack } from "@/lib/analytics";
>>>>>>> theirs

export async function GET() {
  await requireRole("admin");

  // How far back we recompute daily aggregates.
  // Keep this relatively small; re-running daily is cheap.
  const daysBack = getAggregateDaysBack(120);

  try {
<<<<<<< ours
    const res = await aggregateDocViewDaily({ daysBack });
    return NextResponse.json(res);
  } catch {
=======
    const upserts = await aggregateDocViewsDaily(daysBack);

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      daysBack,
      upserts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
>>>>>>> theirs
    return NextResponse.json(
      {
        ok: false,
        error: "SERVER_ERROR",
        hint:
<<<<<<< ours
          "Ensure public.doc_view_daily exists (scripts/sql/doc_view_daily.sql) and public.doc_views exists.",
=======
          "Ensure public.doc_view_daily exists (see scripts/sql/doc_view_daily.sql) and public.doc_views exists.",
>>>>>>> theirs
      },
      { status: 500 }
    );
  }
}
