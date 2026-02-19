// src/app/admin/audit/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditRow = {
  created_at: string;
  event: string | null;
  doc_id: string | null;
  alias: string | null;
  share_token: string | null;
  email_used: string | null;
  ip: string | null;
  device_hash: string | null;
  user_agent: string | null;
  meta: any;
};

type AccessRow = {
  accessed_at: string;
  doc_id: string;
  alias: string | null;
  share_id: string | null;
  email_used: string | null;
  ip: string | null;
  device_hash: string | null;
  user_agent: string | null;
};

async function tryQueryAudit(): Promise<AuditRow[]> {
  // Best-effort because table names/columns may vary across envs.
  // Prefer a rich audit table if present.
  try {
    const rows = (await sql`
      select
        created_at::text as created_at,
        event::text as event,
        doc_id::text as doc_id,
        alias::text as alias,
        share_token::text as share_token,
        email_used::text as email_used,
        ip::text as ip,
        device_hash::text as device_hash,
        user_agent::text as user_agent,
        meta
      from public.doc_audit
      order by created_at desc
      limit 500
    `) as unknown as AuditRow[];
    return rows;
  } catch {
    // fallback
  }

  try {
    const rows = (await sql`
      select
        created_at::text as created_at,
        action::text as event,
        doc_id::text as doc_id,
        alias::text as alias,
        share_token::text as share_token,
        email_used::text as email_used,
        ip::text as ip,
        device_hash::text as device_hash,
        user_agent::text as user_agent,
        meta
      from public.doc_access_log
      order by created_at desc
      limit 500
    `) as unknown as AuditRow[];
    return rows;
  } catch {
    return [];
  }
}

async function tryQueryAccessLogs(): Promise<AccessRow[]> {
  try {
    const rows = (await sql`
      select
        accessed_at::text as accessed_at,
        doc_id::text as doc_id,
        alias::text as alias,
        share_id::text as share_id,
        email_used::text as email_used,
        ip::text as ip,
        device_hash::text as device_hash,
        user_agent::text as user_agent
      from public.doc_access_logs
      order by accessed_at desc
      limit 200
    `) as unknown as AccessRow[];
    return rows;
  } catch {
    return [];
  }
}

export default async function AdminAuditPage() {
  const ok = await isOwnerAdmin();
  if (!ok) redirect("/api/auth/signin");

  const [audit, access] = await Promise.all([tryQueryAudit(), tryQueryAccessLogs()]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit logs</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Owner-only. Best-effort tables: <span className="font-mono">doc_audit</span>,
            <span className="ml-1 font-mono">doc_access_log</span>,
            <span className="ml-1 font-mono">doc_access_logs</span>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Back to dashboard
          </Link>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Home
          </Link>
        </div>
      </div>

      {/* AUDIT TABLE */}
      <div className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Audit events</h2>
            <p className="mt-1 text-sm text-neutral-400">Most detailed log if available.</p>
          </div>
          <div className="text-xs text-neutral-500">Rows: {audit.length}</div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-300">
              <tr>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">Doc</th>
                <th className="px-4 py-3 text-left">Alias</th>
                <th className="px-4 py-3 text-left">Share</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-left">Device</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-neutral-400">
                    No audit rows found (or audit table not available).
                  </td>
                </tr>
              ) : (
                audit.map((r, idx) => (
                  <tr key={`${r.created_at}-${r.doc_id ?? ""}-${idx}`} className="border-t border-neutral-800">
                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-neutral-200">{r.event || "—"}</td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.doc_id || <span className="text-neutral-500">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.alias ? (
                        <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                          {r.alias}
                        </Link>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.share_token || <span className="text-neutral-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{r.email_used || <span className="text-neutral-500">—</span>}</td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.ip || <span className="text-neutral-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.device_hash || <span className="text-neutral-500">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ACCESS LOGS */}
      <div className="mt-12">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Access logs</h2>
            <p className="mt-1 text-sm text-neutral-400">Quick view table (if present).</p>
          </div>
          <div className="text-xs text-neutral-500">Rows: {access.length}</div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-neutral-300">
              <tr>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">Doc</th>
                <th className="px-4 py-3 text-left">Alias</th>
                <th className="px-4 py-3 text-left">Share</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-left">Device</th>
              </tr>
            </thead>
            <tbody>
              {access.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-neutral-400">
                    No access log rows found (or table not available).
                  </td>
                </tr>
              ) : (
                access.map((r, idx) => (
                  <tr key={`${r.doc_id}-${r.accessed_at}-${idx}`} className="border-t border-neutral-800">
                    <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                      {new Date(r.accessed_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">{r.doc_id}</td>
                    <td className="px-4 py-3">
                      {r.alias ? (
                        <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                          {r.alias}
                        </Link>
                      ) : (
                        <span className="text-neutral-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.share_id || <span className="text-neutral-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">{r.email_used || <span className="text-neutral-500">—</span>}</td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.ip || <span className="text-neutral-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {r.device_hash || <span className="text-neutral-500">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
