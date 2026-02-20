// src/app/admin/audit/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { unstable_noStore as noStore } from "next/cache";
import { getAuthedUser } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditPage() {
  noStore();

  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");
  const canSeeAll = u.role === "owner" || u.role === "admin";

  let auditRows: any[] = [];
  let accessRows: any[] = [];
  let viewRows: any[] = [];
  let accessError: string | null = null;

  try {
    auditRows = await (canSeeAll
      ? sql`
        select *
        from public.doc_audit
        order by created_at desc
        limit 50
      `
      : sql`
        select *
        from public.doc_audit a
        where a.doc_id in (select d.id from public.docs d where d.owner_id = ${u.id}::uuid)
        order by a.created_at desc
        limit 50
      `);
  } catch { }

  try {
    // Be tolerant of schema drift. Some environments may not have `accessed_at`.
    // We fetch a larger window and sort in JS using the first timestamp-like column we find.
    const raw = (await sql`
      select *
      from public.doc_access_log
      limit 200
    `) as unknown as any[];

    const filtered = canSeeAll
      ? raw
      : raw.filter((r) => {
        const docId = String(r?.doc_id || r?.docId || "").trim();
        return !!docId;
      });

    // If viewer, do a cheap allowlist query of owned doc_ids.
    let owned: Set<string> | null = null;
    if (!canSeeAll) {
      const ids = (await sql`
        select id::text as id
        from public.docs
        where owner_id = ${u.id}::uuid
      `) as unknown as Array<{ id: string }>;
      owned = new Set(ids.map((x) => x.id));
    }

    const scoped = canSeeAll
      ? raw
      : filtered.filter((r) => owned?.has(String(r?.doc_id || r?.docId || "")));

    const preferredCols = ["accessed_at", "accessedAt", "created_at", "createdAt", "ts", "timestamp"];
    const cols = scoped?.[0] ? Object.keys(scoped[0]) : [];
    const tsCol = preferredCols.find((c) => cols.includes(c)) ?? null;

    if (!tsCol) {
      accessRows = scoped.slice(0, 50);
    } else {
      const toTime = (v: any) => {
        if (!v) return 0;
        const d = new Date(v);
        const t = d.getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      accessRows = scoped
        .slice()
        .sort((a, b) => toTime(b?.[tsCol]) - toTime(a?.[tsCol]))
        .slice(0, 50);
    }
  } catch (err: any) {
    accessError = err.message;
  }

  try {
    viewRows = await (canSeeAll
      ? sql`
        select *
        from public.doc_views
        order by viewed_at desc
        limit 50
      `
      : sql`
        select *
        from public.doc_views v
        where v.doc_id in (select d.id from public.docs d where d.owner_id = ${u.id}::uuid)
        order by v.viewed_at desc
        limit 50
      `);
  } catch { }

  return (
    <div className="mx-auto max-w-7xl p-6 text-white">
      <div className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a
            href="/api/admin/audit/export?type=audit"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Export Audit CSV
          </a>
          <a
            href="/api/admin/audit/export?type=access"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Export Access CSV
          </a>
          <a
            href="/api/admin/audit/export?type=views"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Export Views CSV
          </a>
          <Link
          href="/admin/dashboard"
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          ← Back to dashboard
        </Link>
        </div>

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
