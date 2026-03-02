// src/app/admin/db-debug/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TableRow = { table_name: string };
function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default async function DbDebugPage() {
  noStore();

  try {
    await requireRole("admin");
  } catch {
    redirect("/api/auth/signin");
  }

  let dbUser: string = "unknown";
  let dbName: string | null = null;
  let dbSchema: string | null = null;
  let tables: TableRow[] = [];
  let accessLogRegclass: string | null = null;
  let accessLogColumns: string[] = [];
  let accessLogCount: number | null = null;
  let accessLogError: string | null = null;

  try {
    const r = (await sql`select current_user, current_database() as db, current_schema() as schema`) as unknown as Array<{
      current_user: string;
      db: string;
      schema: string;
    }>;
    dbUser = r?.[0]?.current_user ?? "unknown";
    dbName = r?.[0]?.db ?? null;
    dbSchema = r?.[0]?.schema ?? null;
  } catch (e: unknown) {
    dbUser = `error: ${errorMessage(e)}`;
  }

  try {
    tables = (await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `) as unknown as TableRow[];
  } catch (e: unknown) {
    tables = [{ table_name: `error: ${errorMessage(e)}` }];
  }

  try {
    const r = (await sql`select to_regclass('public.doc_access_log')::text as reg`) as unknown as Array<{ reg: string | null }>;
    accessLogRegclass = r?.[0]?.reg ?? null;
  } catch {
    accessLogRegclass = null;
  }

  if (accessLogRegclass) {
    try {
      const cols = (await sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'doc_access_log'
        order by ordinal_position
      `) as unknown as Array<{ column_name: string }>;
      accessLogColumns = cols.map((c) => c.column_name);
    } catch {
      accessLogColumns = [];
    }

    try {
      const c = (await sql`select count(*)::int as n from public.doc_access_log`) as unknown as Array<{ n: number }>;
      accessLogCount = c?.[0]?.n ?? 0;
    } catch (e: unknown) {
      accessLogError = errorMessage(e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DB Debug</h1>
          <p className="text-sm text-neutral-400">Verifies what tables/columns exist in production.</p>
        </div>
        <Link
          href="/admin/dashboard"
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="space-y-6">
        <div className="glass-card-strong rounded-2xl p-4">
          <div className="text-sm text-neutral-400">Connection</div>
          <div className="mt-2 grid gap-2 text-sm">
            <div>
              <span className="text-neutral-500">current_user:</span> {dbUser}
            </div>
            <div>
              <span className="text-neutral-500">database:</span> {dbName ?? "—"}
            </div>
            <div>
              <span className="text-neutral-500">schema:</span> {dbSchema ?? "—"}
            </div>
          </div>
        </div>

        <div className="glass-card-strong rounded-2xl p-4">
          <div className="mb-3 text-sm text-neutral-400">public tables</div>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="max-h-[420px] overflow-auto">
            <table className="min-w-[420px] text-sm">
              <thead className="sticky top-0 bg-[#10192b]/95 text-left text-neutral-400 backdrop-blur">
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4">table_name</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t, i) => (
                  <tr key={i} className="border-b border-white/10">
                    <td className="py-2 pr-4">{t.table_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>

        <div className="glass-card-strong rounded-2xl p-4">
          <div className="mb-2 text-sm text-neutral-400">public.doc_access_log</div>
          {!accessLogRegclass ? (
            <div className="text-sm text-yellow-400">Not found (to_regclass returned null).</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-neutral-500">regclass:</span> {accessLogRegclass}
              </div>
              <div>
                <span className="text-neutral-500">row count:</span> {accessLogCount ?? "—"}
              </div>
              {accessLogError && (
                <div className="text-red-400">
                  <span className="text-neutral-500">error:</span> {accessLogError}
                </div>
              )}
              <div>
                <div className="text-neutral-500">columns:</div>
                <div className="mt-1 overflow-x-auto rounded-lg border border-neutral-800 bg-black p-2">
                  <code className="whitespace-pre text-xs text-neutral-300">
                    {accessLogColumns.length ? accessLogColumns.join(", ") : "(none returned)"}
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
