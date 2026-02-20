// src/lib/retention.ts
// Best-effort retention cleanup for high-volume tables.
//
// Defaults:
// - RAW logs: 90 days
// - Daily aggregates: 365 days
//
// Configure via env:
// - RETENTION_DAYS
// - RETENTION_DAYS_DAILY

import { sql } from "@/lib/db";

export type RetentionResult = {
  table: string;
  ok: boolean;
  deleted?: number;
  error?: string;
};

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function deleteOlderThan(args: {
  table:
    | "public.doc_views"
    | "public.doc_audit"
    | "public.doc_access_log"
    | "public.doc_daily_analytics"
    | "public.doc_view_daily";
  columnCandidates: Array<"created_at" | "accessed_at" | "day" | "date">;
  days: number;
}): Promise<RetentionResult> {
  const { table, columnCandidates, days } = args;
  const cutoffExpr = sql`(now() - (${days}::int * interval '1 day'))`;

  for (const col of columnCandidates) {
    try {
      // We can't parameterize identifiers safely with this client, so we hardcode per-column.
      if (table === "public.doc_views" && col === "created_at") {
        const res = (await sql`
          with d as (
            delete from public.doc_views
            where created_at < ${cutoffExpr}
            returning 1
          )
          select count(*)::int as deleted from d
        `) as unknown as Array<{ deleted: number }>;
        return { table, ok: true, deleted: res?.[0]?.deleted ?? 0 };
      }

      if (table === "public.doc_audit" && col === "created_at") {
        const res = (await sql`
          with d as (
            delete from public.doc_audit
            where created_at < ${cutoffExpr}
            returning 1
          )
          select count(*)::int as deleted from d
        `) as unknown as Array<{ deleted: number }>;
        return { table, ok: true, deleted: res?.[0]?.deleted ?? 0 };
      }

      if (table === "public.doc_access_log" && col === "accessed_at") {
        const res = (await sql`
          with d as (
            delete from public.doc_access_log
            where accessed_at < ${cutoffExpr}
            returning 1
          )
          select count(*)::int as deleted from d
        `) as unknown as Array<{ deleted: number }>;
        return { table, ok: true, deleted: res?.[0]?.deleted ?? 0 };
      }

      if (table === "public.doc_access_log" && col === "created_at") {
        const res = (await sql`
          with d as (
            delete from public.doc_access_log
            where created_at < ${cutoffExpr}
            returning 1
          )
          select count(*)::int as deleted from d
        `) as unknown as Array<{ deleted: number }>;
        return { table, ok: true, deleted: res?.[0]?.deleted ?? 0 };
      }

      if (table === "public.doc_daily_analytics" && col === "day") {
        const res = (await sql`
          with d as (
            delete from public.doc_daily_analytics
            where day < (current_date - (${days}::int * interval '1 day'))
            returning 1
          )
          select count(*)::int as deleted from d
        `) as unknown as Array<{ deleted: number }>;
        return { table, ok: true, deleted: res?.[0]?.deleted ?? 0 };
      }

      if (table === "public.doc_view_daily" && col === "date") {
        const res = (await sql`
          with d as (
            delete from public.doc_view_daily
            where date < (current_date - (${days}::int * interval '1 day'))
            returning 1
          )
          select count(*)::int as deleted from d
        `) as unknown as Array<{ deleted: number }>;
        return { table, ok: true, deleted: res?.[0]?.deleted ?? 0 };
      }
    } catch (e) {
      // Try the next column candidate.
      const msg = e instanceof Error ? e.message : String(e);
      // If table doesn't exist, surface it immediately.
      const anyErr = e as any;
      if (anyErr?.code === "42P01") {
        return { table, ok: false, error: "Table not found (SQLSTATE 42P01)." };
      }
      // Continue to next column candidate.
      if (col === columnCandidates[columnCandidates.length - 1]) {
        return { table, ok: false, error: msg };
      }
    }
  }

  return { table, ok: false, error: "No matching timestamp column found." };
}

export async function runRetention(): Promise<{ rawDays: number; dailyDays: number; results: RetentionResult[] }> {
  const rawDays = envInt("RETENTION_DAYS", 90);
  const dailyDays = envInt("RETENTION_DAYS_DAILY", 365);

  const results: RetentionResult[] = [];

  results.push(
    await deleteOlderThan({
      table: "public.doc_views",
      columnCandidates: ["created_at"],
      days: rawDays,
    })
  );
  results.push(
    await deleteOlderThan({
      table: "public.doc_audit",
      columnCandidates: ["created_at"],
      days: rawDays,
    })
  );
  results.push(
    await deleteOlderThan({
      table: "public.doc_access_log",
      columnCandidates: ["accessed_at", "created_at"],
      days: rawDays,
    })
  );
  results.push(
    await deleteOlderThan({
      table: "public.doc_daily_analytics",
      columnCandidates: ["day"],
      days: dailyDays,
    })
  );

  results.push(
    await deleteOlderThan({
      table: "public.doc_view_daily",
      columnCandidates: ["date"],
      days: dailyDays,
    })
  );

  return { rawDays, dailyDays, results };
}
