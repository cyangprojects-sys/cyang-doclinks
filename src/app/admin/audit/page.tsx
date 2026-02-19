// src/app/admin/audit/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditPage() {
  noStore();

  const ok = await isOwnerAdmin();
  if (!ok) redirect("/api/auth/signin");

  let auditRows: any[] = [];
  let accessRows: any[] = [];
  let viewRows: any[] = [];
  let accessError: string | null = null;

  try {
    auditRows = await sql`
      select *
      from public.doc_audit
      order by created_at desc
      limit 50
    `;
  } catch { }

  try {
    // Be tolerant of schema drift. Some environments may not have `accessed_at`.
    // We fetch a larger window and sort in JS using the first timestamp-like column we find.
    const raw = (await sql`
      select *
      from public.doc_access_log
      limit 200
    `) as unknown as any[];

    const preferredCols = ["accessed_at", "accessedAt", "created_at", "createdAt", "ts", "timestamp"];
    const cols = raw?.[0] ? Object.keys(raw[0]) : [];
    const tsCol = preferredCols.find((c) => cols.includes(c)) ?? null;

    if (!tsCol) {
      accessRows = raw.slice(0, 50);
    } else {
      const toTime = (v: any) => {
        if (!v) return 0;
        const d = new Date(v);
        const t = d.getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      accessRows = raw
        .slice()
        .sort((a, b) => toTime(b?.[tsCol]) - toTime(a?.[tsCol]))
        .slice(0, 50);
    }
  } catch (err: any) {
    accessError = err.message;
  }

  try {
    viewRows = await sql`
      select *
      from public.doc_views
      order by viewed_at desc
      limit 50
    `;
  } catch { }

  return (
    <div className="mx-auto max-w-7xl p-6 text-white">
      <div className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <Link
          href="/admin/dashboard"
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="space-y-10">

        {/* ================= AUDIT EVENTS ================= */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Audit Events</h2>

          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-[1200px] text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  {auditRows[0] &&
                    Object.keys(auditRows[0]).map((key) => (
                      <th key={key} className="px-4 py-3 text-left">
                        {key}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-neutral-800 hover:bg-neutral-900"
                  >
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap">
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ================= ACCESS LOGS ================= */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Access Logs</h2>

          {accessError && (
            <div className="text-yellow-400 text-sm">
              Access logs query failed.<br />
              <span className="text-neutral-500">{accessError}</span>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-[1200px] text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  {accessRows[0] &&
                    Object.keys(accessRows[0]).map((key) => (
                      <th key={key} className="px-4 py-3 text-left">
                        {key}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {accessRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-neutral-800 hover:bg-neutral-900"
                  >
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap">
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ================= VIEWS ================= */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Views</h2>

          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-[1200px] text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  {viewRows[0] &&
                    Object.keys(viewRows[0]).map((key) => (
                      <th key={key} className="px-4 py-3 text-left">
                        {key}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {viewRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-t border-neutral-800 hover:bg-neutral-900"
                  >
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap">
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
