// src/app/admin/api-keys/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import { getAuthedUser } from "@/lib/authz";
import CreateApiKeyForm from "./CreateApiKeyForm";
import RevokeApiKeyButton from "./RevokeApiKeyButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

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
    <div className="mx-auto max-w-5xl p-6 text-white">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <Link
          href="/admin/dashboard"
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <p className="text-sm text-neutral-300">
          Create keys for programmatic access. Keys are shown <span className="font-medium">once</span> at creation.
          Store them somewhere safe.
        </p>
        <div className="mt-4">
          <CreateApiKeyForm />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-medium">Your keys</h2>

        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-800">
          <table className="min-w-[900px] text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
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
                  <tr key={r.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                    <td className="px-4 py-3 whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{r.prefix}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.created_at}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.last_used_at ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {revoked ? (
                        <span className="text-neutral-400">Revoked</span>
                      ) : (
                        <span className="text-emerald-300">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {revoked ? (
                        <span className="text-neutral-500">—</span>
                      ) : (
                        <RevokeApiKeyButton id={r.id} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={6}>
                    No API keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-neutral-400">
          Tip: set <span className="font-mono">API_KEY_SALT</span> in your environment to enable hashing.
        </div>
      </div>
    </div>
  );
}
