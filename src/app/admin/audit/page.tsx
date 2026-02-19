// src/app/admin/audit/page.tsx
import { sql } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueryState = {
  name: string;
  ok: boolean;
  error?: string;
  rows: Record<string, any>[];
  total?: number;
};

async function isOwner(): Promise<boolean> {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner) return false;

  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();

  return !!email && email === owner;
}

function isMissingRelationError(err: unknown): boolean {
  const anyErr = err as any;
  const code = typeof anyErr?.code === "string" ? anyErr.code : "";
  if (code === "42P01") return true;

  const msg = (anyErr?.message ? String(anyErr.message) : String(err)).toLowerCase();
  return msg.includes("does not exist") || msg.includes("undefined_table");
}

async function tryQuery(name: string, queryFn: () => Promise<any>, countFn?: () => Promise<any>): Promise<QueryState> {
  try {
    const res = await queryFn();
    const rows: Record<string, any>[] = Array.isArray(res) ? res : (res?.rows ?? []);
    let total: number | undefined = undefined;
    if (countFn) {
      try {
        const c = await countFn();
        const crow = (Array.isArray(c) ? c : (c?.rows ?? []))?.[0] as any;
        if (crow) {
          const v = crow.total ?? crow.count ?? Object.values(crow)[0];
          const n = Number(v);
          if (Number.isFinite(n)) total = n;
        }
      } catch {
        // ignore count errors
      }
    }
    return { name, ok: true, rows, total };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isMissingRelationError(e)) {
      return { name, ok: false, error: "Table not found (or not accessible).", rows: [] };
    }
    return { name, ok: false, error: message, rows: [] };
  }
}

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function makeHref(args: { page: number; doc?: string | null; limit: number }) {
  const usp = new URLSearchParams();
  if (args.doc) usp.set("doc", args.doc);
  usp.set("page", String(args.page));
  usp.set("limit", String(args.limit));
  const s = usp.toString();
  return s ? `/admin/audit?${s}` : "/admin/audit";
}

function ScrollTable({ title, subtitle, state }: { title: string; subtitle?: string; state: QueryState }) {
  const keys = state.rows.length ? Object.keys(state.rows[0] ?? {}) : [];

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40">
      <div className="flex flex-col gap-1 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
          <div className="text-xs text-neutral-400">
            {state.ok
              ? `${state.rows.length} rows${typeof state.total === "number" ? ` (of ${state.total})` : ""}`
              : "unavailable"}
          </div>
        </div>
        {subtitle ? <div className="text-xs text-neutral-400">{subtitle}</div> : null}
        {!state.ok && state.error ? <div className="text-xs text-amber-300">{state.error}</div> : null}
      </div>

      {state.rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-400">No rows found.</div>
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-900/80 text-neutral-300">
              <tr>
                {keys.map((k) => (
                  <th key={k} className="whitespace-nowrap px-4 py-2 font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {state.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-neutral-900/30">
                  {keys.map((k) => {
                    const val = row[k];
                    if (k === "doc_id" && val) {
                      return (
                        <td key={k} className="whitespace-nowrap px-4 py-2 font-mono text-neutral-200">
                          <Link className="text-emerald-300 hover:underline" href={`/serve/${val}`}>
                            {fmt(val)}
                          </Link>
                        </td>
                      );
                    }
                    return (
                      <td key={k} className="whitespace-nowrap px-4 py-2 font-mono text-neutral-200">
                        {fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; doc?: string }>;
}) {
  const ok = await isOwner();
  if (!ok) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <div className="text-lg font-semibold text-neutral-100">Not authorized</div>
          <div className="mt-2 text-sm text-neutral-400">This page is restricted to the site owner.</div>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const limit = clampInt(Number(sp.limit ?? "50"), 10, 200);
  const page = clampInt(Number(sp.page ?? "1"), 1, 10_000);
  const offset = (page - 1) * limit;

  const doc = (sp.doc || "").trim();
  const docFilter = doc ? doc : null;

  // doc_audit
  const audit = await tryQuery(
    "doc_audit",
    async () => {
      if (docFilter) {
        return sql`
          select *
          from public.doc_audit
          where doc_id = ${docFilter}::uuid
          order by created_at desc
          limit ${limit} offset ${offset}
        `;
      }
      return sql`
        select *
        from public.doc_audit
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
    },
    async () => {
      if (docFilter) {
        return sql`select count(*)::int as total from public.doc_audit where doc_id = ${docFilter}::uuid`;
      }
      return sql`select count(*)::int as total from public.doc_audit`;
    }
  );

  // doc_access_log (some schemas use accessed_at, some created_at)
  const accessLog = await tryQuery(
    "doc_access_log",
    async () => {
      if (docFilter) {
        try {
          return sql`
            select *
            from public.doc_access_log
            where doc_id = ${docFilter}::uuid
            order by accessed_at desc
            limit ${limit} offset ${offset}
          `;
        } catch {
          return sql`
            select *
            from public.doc_access_log
            where doc_id = ${docFilter}::uuid
            order by created_at desc
            limit ${limit} offset ${offset}
          `;
        }
      }
      try {
        return sql`
          select *
          from public.doc_access_log
          order by accessed_at desc
          limit ${limit} offset ${offset}
        `;
      } catch {
        return sql`
          select *
          from public.doc_access_log
          order by created_at desc
          limit ${limit} offset ${offset}
        `;
      }
    },
    async () => {
      if (docFilter) {
        return sql`select count(*)::int as total from public.doc_access_log where doc_id = ${docFilter}::uuid`;
      }
      return sql`select count(*)::int as total from public.doc_access_log`;
    }
  );

  // doc_views
  const docViews = await tryQuery(
    "doc_views",
    async () => {
      if (docFilter) {
        return sql`
          select *
          from public.doc_views
          where doc_id = ${docFilter}::uuid
          order by created_at desc
          limit ${limit} offset ${offset}
        `;
      }
      return sql`
        select *
        from public.doc_views
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
    },
    async () => {
      if (docFilter) {
        return sql`select count(*)::int as total from public.doc_views where doc_id = ${docFilter}::uuid`;
      }
      return sql`select count(*)::int as total from public.doc_views`;
    }
  );

  const maxTotal = Math.max(audit.total ?? 0, accessLog.total ?? 0, docViews.total ?? 0);
  const hasNext = typeof maxTotal === "number" ? offset + limit < maxTotal : true;
  const hasPrev = page > 1;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Audit logs</h1>
          <div className="mt-1 text-sm text-neutral-400">Recent access and security-related events.</div>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-sm text-emerald-300 hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div>
              <label className="block text-xs text-neutral-400">Filter by doc_id (UUID)</label>
              <input
                defaultValue={docFilter ?? ""}
                name="doc"
                placeholder="e.g., 6c9f… (uuid)"
                className="mt-1 w-full md:w-[420px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                form="auditFilters"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400">Rows per page</label>
              <select
                defaultValue={String(limit)}
                name="limit"
                className="mt-1 w-full md:w-[160px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                form="auditFilters"
              >
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <form id="auditFilters" action="/admin/audit" method="get" className="flex items-center gap-2">
            <input type="hidden" name="page" value="1" />
            <button className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900">
              Apply
            </button>
            <Link
              href={makeHref({ page: 1, limit, doc: null })}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            >
              Clear
            </Link>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <div>
            Page <span className="text-neutral-200">{page}</span> · Showing up to{" "}
            <span className="text-neutral-200">{limit}</span> rows per table
            {docFilter ? (
              <>
                {" "}· Filter:{" "}
                <span className="text-neutral-200 font-mono">{docFilter}</span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={makeHref({ page: Math.max(1, page - 1), doc: docFilter, limit })}
              aria-disabled={!hasPrev}
              className={`rounded-lg border border-neutral-800 px-3 py-1.5 ${
                hasPrev ? "bg-neutral-950 text-neutral-200 hover:bg-neutral-900" : "bg-neutral-950/40 text-neutral-600 pointer-events-none"
              }`}
            >
              ← Prev
            </Link>
            <Link
              href={makeHref({ page: page + 1, doc: docFilter, limit })}
              aria-disabled={!hasNext}
              className={`rounded-lg border border-neutral-800 px-3 py-1.5 ${
                hasNext ? "bg-neutral-950 text-neutral-200 hover:bg-neutral-900" : "bg-neutral-950/40 text-neutral-600 pointer-events-none"
              }`}
            >
              Next →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <ScrollTable title="Audit events" subtitle="Reads from public.doc_audit (if present)." state={audit} />
        <ScrollTable title="Access logs" subtitle="Reads from public.doc_access_log (if present)." state={accessLog} />
        <ScrollTable title="Views" subtitle="Reads from public.doc_views (if present)." state={docViews} />
      </div>
    </div>
  );
}
