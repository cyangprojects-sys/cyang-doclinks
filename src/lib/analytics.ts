// src/lib/analytics.ts
// Lightweight analytics helpers (daily aggregation, top docs queries, etc.).

import { sql } from "@/lib/db";

const MAX_ENV_INT_LEN = 24;
const MIN_AGGREGATE_DAYS_BACK = 1;
const MAX_AGGREGATE_DAYS_BACK = 3650;

export function envInt(name: string, fallback: number): number {
  const rawInput = String(process.env[name] || "");
  if (/[\r\n\0]/.test(rawInput)) return fallback;
  const raw = rawInput.trim();
  if (!raw || raw.length > MAX_ENV_INT_LEN) return fallback;
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function tableExists(fqTable: string): Promise<boolean> {
  const table = String(fqTable || "").trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]{0,62}\.[a-z_][a-z0-9_]{0,62}$/.test(table)) return false;
  try {
    const rows = (await sql`select to_regclass(${table})::text as reg`) as unknown as Array<{
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
  const requestedDaysBack = Number(args?.daysBack ?? envInt("ANALYTICS_AGGREGATE_DAYS_BACK", 120));
  const daysBack = Number.isFinite(requestedDaysBack)
    ? Math.max(MIN_AGGREGATE_DAYS_BACK, Math.min(MAX_AGGREGATE_DAYS_BACK, Math.floor(requestedDaysBack)))
    : 120;
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
    from public.doc_views v
    where v.created_at >= (now() - (${daysBack}::int * interval '1 day'))
    group by 1, 2
    on conflict (doc_id, date)
    do update set
      view_count = excluded.view_count,
      unique_ip_count = excluded.unique_ip_count,
      updated_at = now()
    returning 1
  `) as unknown as Array<{ "?column?": number }>;

  return {
    ok: true,
    now,
    daysBack,
    upserts: Array.isArray(res) ? res.length : 0,
    table: "public.doc_view_daily",
  };
}
