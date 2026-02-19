// src/app/admin/audit/page.tsx
import { sql } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditPage() {
  noStore();

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
    accessRows = await sql`
      select *
      from public.doc_access_log
      order by accessed_at desc
      limit 50
    `;
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
      <h1 className="text-2xl font-semibold mb-8">Audit Logs</h1>

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
              Table not found (or not accessible).<br />
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
