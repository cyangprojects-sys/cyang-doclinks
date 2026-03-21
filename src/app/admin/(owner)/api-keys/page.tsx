// src/app/admin/(owner)/api-keys/page.tsx
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import { getAuthedUser } from "@/lib/authz";
import CreateApiKeyForm from "./CreateApiKeyForm";
import RevokeApiKeyButton from "./RevokeApiKeyButton";

export const runtime = "nodejs";

type Row = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

function fmtDate(s: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default async function ApiKeysPage() {
  noStore();

  const u = await getAuthedUser();
  if (!u) redirect("/api/auth/signin");
  const canAdmin = u.role === "owner" || u.role === "admin";
  if (!canAdmin) redirect("/");

  const rows = (await sql`
    select
      id::text as id,
      name,
      prefix,
      created_at::text as created_at,
      revoked_at::text as revoked_at,
      last_used_at::text as last_used_at
    from public.api_keys
    where owner_id = ${u.id}::uuid
    order by created_at desc
    limit 200
  `) as unknown as Row[];

  return (
    <div className="w-full p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">API Keys</h1>
      </div>

      <section className="surface-panel-strong rounded-sm p-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Create keys for programmatic access. New keys are shown once at creation.
        </p>
        <div className="mt-4">
          <CreateApiKeyForm />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">Your keys</h2>
        <div className="surface-panel-strong mt-3 overflow-hidden rounded-sm">
          <div className="max-h-[560px] overflow-auto">
          <table className="min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-[rgba(245,248,252,0.96)] text-[var(--text-muted)] backdrop-blur">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Prefix</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Last used</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const revoked = !!r.revoked_at;
                return (
                  <tr key={r.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]/80">
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{r.prefix}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{fmtDate(r.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{fmtDate(r.last_used_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {revoked ? (
                        <span className="inline-flex items-center rounded-sm border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Revoked</span>
                      ) : (
                        <span className="inline-flex items-center rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Active</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {revoked ? <span className="text-[var(--text-faint)]">-</span> : <RevokeApiKeyButton id={r.id} />}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td className="px-4 py-6 text-[var(--text-muted)]" colSpan={6}>
                    No API keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="mt-3 text-xs text-[var(--text-muted)]">
          Tip: set <span className="font-mono">API_KEY_SALT</span> in env to enable hashing.
        </div>
      </section>
    </div>
  );
}
