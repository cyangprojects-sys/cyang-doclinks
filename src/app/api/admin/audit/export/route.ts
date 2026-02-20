// src/app/api/admin/audit/export/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";

type ExportType = "audit" | "access" | "views";

function csvEscape(v: any): string {
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

async function getTimestampColumn(tableName: string): Promise<string | null> {
  // Prefer common timestamp columns, fall back to null.
  const preferred = ["created_at", "accessed_at", "viewed_at", "ts", "timestamp", "updated_at"];
  try {
    const cols = (await sql`
      select column_name::text as name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
    `) as unknown as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    return preferred.find((p) => names.includes(p)) ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
  } catch {
    return new Response("Forbidden", { status: 403 });
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
  const tsCol = await getTimestampColumn(picked.table);

  // Build query:
  // - Use best-effort time window based on timestamp-like column.
  // - If tsCol missing, export most recent by primary key-ish order is not guaranteed; still limit.
  let rows: any[] = [];
  try {
    if (tsCol) {
      // Note: column name is injected as identifier, not as a parameter.
      const q = `
        select *
        from public.${picked.table}
        where ${tsCol} >= (now() - ($1::int * interval '1 day'))
        order by ${tsCol} desc
        limit $2
      `;
      rows = (await sql(q, [days, limit])) as any[];
    } else {
      const q = `
        select *
        from public.${picked.table}
        limit $1
      `;
      rows = (await sql(q, [limit])) as any[];
    }
  } catch (err: any) {
    return new Response(`Export failed: ${err?.message || "unknown error"}`, { status: 500 });
  }

  const cols = rows?.[0] ? Object.keys(rows[0]) : [];
  const header = cols.join(",");
  const lines = rows.map((r) => cols.map((c) => csvEscape((r as any)[c])).join(","));
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
