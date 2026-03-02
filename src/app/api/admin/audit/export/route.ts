// src/app/api/admin/audit/export/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getPlanForUser } from "@/lib/monetization";

type ExportType = "audit" | "access" | "views";
type CsvRow = Record<string, unknown>;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

// NOTE: Our DB client (Neon `sql`) is a *tagged template* function.
// That means we can't pass a raw string query into it without fighting types.
// For export we keep the query fully static (by `type`) and parameterize values.

// All current audit/access/views tables use `created_at`.
// We keep it static so the query stays fully typed and parameterized.

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try {
    const u = await requirePermission("audit.export");
    userId = u.id;
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  if (userId) {
    const plan = await getPlanForUser(userId);
    if (!plan.allowAuditExport) {
      return new Response("Audit export requires a plan with export entitlement.", { status: 403 });
    }
  }

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "audit").toLowerCase() as ExportType;
  const days = parseIntParam(url.searchParams.get("days"), 30, 1, 365);
  const limit = parseIntParam(url.searchParams.get("limit"), 20000, 1, 50000);

  const map: Record<ExportType, { table: string; filename: string }> = {
    audit: { table: "doc_audit", filename: "audit_events.csv" },
    access: { table: "doc_access_log", filename: "access_logs.csv" },
    views: { table: "doc_views", filename: "views.csv" },
  };

  const picked = map[type] ?? map.audit;

  // Build query (static per table) so we can keep using the tagged template.
  // We assume these tables have `created_at` (true for our schemas).
  // If a table is missing the column, we'll surface a clean error.
  let rows: CsvRow[] = [];
  try {
    if (type === "audit") {
      rows = (await sql`
        select *
        from public.doc_audit
        where created_at >= (now() - (${days}::int * interval '1 day'))
        order by created_at desc
        limit ${limit}
      `) as CsvRow[];
    } else if (type === "access") {
      rows = (await sql`
        select *
        from public.doc_access_log
        where created_at >= (now() - (${days}::int * interval '1 day'))
        order by created_at desc
        limit ${limit}
      `) as CsvRow[];
    } else {
      rows = (await sql`
        select *
        from public.doc_views
        where created_at >= (now() - (${days}::int * interval '1 day'))
        order by created_at desc
        limit ${limit}
      `) as CsvRow[];
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(`Export failed: ${msg}`, { status: 500 });
  }

  const cols = rows?.[0] ? Object.keys(rows[0]) : [];
  const header = cols.join(",");
  const lines = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","));
  const csv = [header, ...lines].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${stamp}_${picked.filename}`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
