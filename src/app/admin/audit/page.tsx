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
};

async function isOwner(): Promise<boolean> {
  const owner = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!owner) return false;

  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();

  return !!email && email === owner;
}

function isMissingRelationError(err: unknown): boolean {
  // Prefer SQLSTATE when available (Postgres undefined_table = 42P01)
  const anyErr = err as any;
  const code = typeof anyErr?.code === "string" ? anyErr.code : "";
  if (code === "42P01") return true;

  // Fallback to message matching (avoid overly-broad matches like "relation")
  const msg = (anyErr?.message ? String(anyErr.message) : String(err)).toLowerCase();
  return msg.includes("does not exist") || msg.includes("undefined_table");
}

async function tryQuery(name: string, queryFn: () => Promise<any>): Promise<QueryState> {
  try {
    const res = await queryFn();
    const rows: Record<string, any>[] = Array.isArray(res) ? res : (res?.rows ?? []);
    return { name, ok: true, rows };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // If the table isn't present yet, don't hard-fail the admin page.
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

function Table({
  title,
  subtitle,
  state,
}: {
  title: string;
  subtitle?: string;
  state: QueryState;
}) {
  const keys = state.rows.length ? Object.keys(state.rows[0] ?? {}) : [];
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40">
      <div className="flex flex-col gap-1 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
          <div className="text-xs text-neutral-400">
            {state.ok ? `${state.rows.length} rows` : "unavailable"}
          </div>
        </div>
        {subtitle ? <div className="text-xs text-neutral-400">{subtitle}</div> : null}
        {!state.ok && state.error ? (
          <div className="text-xs text-amber-300">{state.error}</div>
        ) : null}
      </div>

      {state.rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-neutral-400">No rows found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-neutral-900/60 text-neutral-300">
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
                    // If we have a doc_id, make it clickable to the serve route.
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

export default async function AdminAuditPage() {
  const ok = await isOwner();
  if (!ok) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
          <div className="text-lg font-semibold text-neutral-100">Not authorized</div>
          <div className="mt-2 text-sm text-neutral-400">
            This page is restricted to the site owner.
          </div>
        </div>
      </div>
    );
  }

  // Best-effort: you said you created 2 tables for auditing/logging.
  // We try several common names so the page works without crashing.
  const audit =
    (await tryQuery("doc_audit", async () => sql`SELECT * FROM doc_audit ORDER BY created_at DESC LIMIT 200`))
      .rows.length
      ? await tryQuery("doc_audit", async () => sql`SELECT * FROM doc_audit ORDER BY created_at DESC LIMIT 200`)
      : await tryQuery("doc_audit", async () => sql`SELECT * FROM doc_audit ORDER BY 1 DESC LIMIT 200`);

  const accessLog = await tryQuery("doc_access_log", async () =>
    sql`SELECT * FROM doc_access_log ORDER BY created_at DESC LIMIT 200`
  );

  const docViews = await tryQuery("doc_views", async () =>
    sql`SELECT * FROM public.doc_views ORDER BY created_at DESC LIMIT 200`
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Audit logs</h1>
          <div className="mt-1 text-sm text-neutral-400">
            Recent access and security-related events.
          </div>
        </div>
        <Link href="/admin/dashboard" className="text-sm text-emerald-300 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <div className="grid gap-6">
        <Table
          title="Audit events"
          subtitle="Reads from doc_audit (if present)."
          state={audit}
        />
        <Table
          title="Access logs"
          subtitle="Reads from doc_access_log (if present)."
          state={accessLog}
        />
        <Table
          title="Views"
          subtitle="Reads from doc_views (if present)."
          state={docViews}
        />
      </div>
    </div>
  );
}
