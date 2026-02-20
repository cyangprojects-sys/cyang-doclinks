// src/lib/retention.ts
// Best-effort retention cleanup for high-volume tables.
//
// Defaults:
// - RAW logs: 90 days
// - Daily aggregates: 365 days
// - Expired share tokens: delete immediately (optional)
//
// Configure via env:
// - RETENTION_DAYS
// - RETENTION_DAYS_DAILY
// - RETENTION_ENABLED (true/false) [fallback only; DB toggle preferred]
// - RETENTION_DELETE_EXPIRED_SHARES (true/false) [fallback only; DB toggle preferred]
// - RETENTION_SHARE_GRACE_DAYS (int >= 0) [fallback only; DB toggle preferred]

import { sql } from "@/lib/db";
import { getRetentionSettings } from "@/lib/settings";

export type RetentionResult = {
  table: string;
  ok: boolean;
  deleted?: number;
  error?: string;
};

export type RetentionRun = {
  enabled: boolean;
  rawDays: number;
  dailyDays: number;
  deleteExpiredShares: boolean;
  shareGraceDays: number;
  results: RetentionResult[];
  source: "db" | "env";
};

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
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

async function deleteExpiredShareTokens(args: { graceDays: number }): Promise<RetentionResult> {
  const graceDays = Math.max(0, Math.floor(args.graceDays));
  try {
    if (graceDays === 0) {
      const res = (await sql`
        with d as (
          delete from public.share_tokens
          where expires_at is not null
            and expires_at <= now()
          returning 1
        )
        select count(*)::int as deleted from d
      `) as unknown as Array<{ deleted: number }>;
      return { table: "public.share_tokens", ok: true, deleted: res?.[0]?.deleted ?? 0 };
    }

    const res = (await sql`
      with d as (
        delete from public.share_tokens
        where expires_at is not null
          and expires_at <= (now() - (${graceDays}::int * interval '1 day'))
        returning 1
      )
      select count(*)::int as deleted from d
    `) as unknown as Array<{ deleted: number }>;
    return { table: "public.share_tokens", ok: true, deleted: res?.[0]?.deleted ?? 0 };
  } catch (e) {
    const anyErr = e as any;
    if (anyErr?.code === "42P01") {
      return { table: "public.share_tokens", ok: false, error: "Table not found (SQLSTATE 42P01)." };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { table: "public.share_tokens", ok: false, error: msg };
  }
}

export async function runRetention(): Promise<RetentionRun> {
  const rawDays = envInt("RETENTION_DAYS", 90);
  const dailyDays = envInt("RETENTION_DAYS_DAILY", 365);

  // Prefer DB settings when available (admin toggle). Fall back to env.
  const dbSettings = await getRetentionSettings();
  const source = dbSettings.ok ? ("db" as const) : ("env" as const);

  const enabled = dbSettings.ok ? dbSettings.settings.enabled : envBool("RETENTION_ENABLED", true);
  const deleteExpiredShares = dbSettings.ok
    ? dbSettings.settings.deleteExpiredShares
    : envBool("RETENTION_DELETE_EXPIRED_SHARES", true);
  const shareGraceDays = dbSettings.ok ? dbSettings.settings.shareGraceDays : envInt("RETENTION_SHARE_GRACE_DAYS", 0);

  const results: RetentionResult[] = [];

  if (!enabled) {
    return {
      enabled,
      rawDays,
      dailyDays,
      deleteExpiredShares,
      shareGraceDays,
      results,
      source,
    };
  }

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

  if (deleteExpiredShares) {
    results.push(await deleteExpiredShareTokens({ graceDays: shareGraceDays }));
  }

  return {
    enabled,
    rawDays,
    dailyDays,
    deleteExpiredShares,
    shareGraceDays,
    results,
    source,
  };
}
