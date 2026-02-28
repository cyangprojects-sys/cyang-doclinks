<<<<<<< ours
// src/lib/analytics.ts
// Lightweight analytics helpers (daily aggregation, top docs queries, etc.).

import { sql } from "@/lib/db";

export function envInt(name: string, fallback: number): number {
=======
import { sql } from "@/lib/db";

function envInt(name: string, fallback: number): number {
>>>>>>> theirs
  const raw = (process.env[name] || "").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

<<<<<<< ours
async function tableExists(fqTable: string): Promise<boolean> {
  try {
    const rows = (await sql`select to_regclass(${fqTable})::text as reg`) as unknown as Array<{
      reg: string | null;
    }>;
    return !!rows?.[0]?.reg;
  } catch {
    return false;
  }
}

export type AggregateResult = {
  ok: boolean;
  now: string;
  daysBack: number;
  upserts: number;
  table: "public.doc_view_daily";
  warning?: string;
};

// Recomputes daily aggregates from public.doc_views into public.doc_view_daily.
// This is safe to run repeatedly (UPSERT by doc_id+date).
export async function aggregateDocViewDaily(args?: { daysBack?: number }): Promise<AggregateResult> {
  const daysBack = args?.daysBack ?? envInt("ANALYTICS_AGGREGATE_DAYS_BACK", 120);
  const now = new Date().toISOString();

  const exists = await tableExists("public.doc_view_daily");
  if (!exists) {
    return {
      ok: false,
      now,
      daysBack,
      upserts: 0,
      table: "public.doc_view_daily",
      warning: "Missing table public.doc_view_daily. Run scripts/sql/doc_view_daily.sql.",
    };
  }

  const res = (await sql`
    insert into public.doc_view_daily
      (doc_id, date, view_count, unique_ip_count)
    select
      v.doc_id,
      date_trunc('day', v.created_at)::date as date,
      count(*)::int as view_count,
      count(distinct coalesce(v.ip_hash, ''))::int as unique_ip_count
=======
export function getAggregateDaysBack(defaultValue = 120): number {
  return envInt("ANALYTICS_AGGREGATE_DAYS_BACK", defaultValue);
}

export async function aggregateDocViewsDaily(daysBack: number): Promise<number> {
  const res = (await sql`
    insert into public.doc_view_daily
      (date, doc_id, view_count, unique_ip_count, last_viewed_at)
    select
      date_trunc('day', v.created_at)::date as date,
      v.doc_id,
      count(*)::int as view_count,
      count(distinct nullif(v.ip_hash, ''))::int as unique_ip_count,
      max(v.created_at) as last_viewed_at
>>>>>>> theirs
    from public.doc_views v
    where v.created_at >= (now() - (${daysBack}::int * interval '1 day'))
    group by 1, 2
    on conflict (doc_id, date)
    do update set
      view_count = excluded.view_count,
      unique_ip_count = excluded.unique_ip_count,
<<<<<<< ours
=======
      last_viewed_at = excluded.last_viewed_at,
>>>>>>> theirs
      updated_at = now()
    returning 1
  `) as unknown as Array<{ "?column?": number }>;

<<<<<<< ours
  return {
    ok: true,
    now,
    daysBack,
    upserts: Array.isArray(res) ? res.length : 0,
    table: "public.doc_view_daily",
  };
}
=======
  return Array.isArray(res) ? res.length : 0;
}

>>>>>>> theirs
