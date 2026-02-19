export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner";
import { sql } from "@/lib/db";

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function GET() {
  const owner = await requireOwner();
  if (!owner.ok) {
    return NextResponse.json(
      { ok: false, error: owner.reason },
      { status: owner.reason === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  // How far back we recompute daily aggregates.
  // Keep this relatively small; re-running daily is cheap.
  const daysBack = envInt("ANALYTICS_AGGREGATE_DAYS_BACK", 120);

  try {
    const res = (await sql`
      insert into public.doc_daily_analytics
        (day, doc_id, views, unique_ips, last_viewed_at)
      select
        date_trunc('day', v.created_at)::date as day,
        v.doc_id,
        count(*)::int as views,
        count(distinct coalesce(v.ip_hash, ''))::int as unique_ips,
        max(v.created_at) as last_viewed_at
      from public.doc_views v
      where v.created_at >= (now() - (${daysBack}::int * interval '1 day'))
      group by 1, 2
      on conflict (day, doc_id)
      do update set
        views = excluded.views,
        unique_ips = excluded.unique_ips,
        last_viewed_at = excluded.last_viewed_at,
        updated_at = now()
      returning 1
    `) as unknown as Array<{ "?column?": number }>;

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      daysBack,
      upserts: Array.isArray(res) ? res.length : 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        hint:
          "Ensure public.doc_daily_analytics exists (see scripts/sql/doc_daily_analytics.sql) and public.doc_views exists.",
      },
      { status: 500 }
    );
  }
}
