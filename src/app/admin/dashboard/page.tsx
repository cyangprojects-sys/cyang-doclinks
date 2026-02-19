// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";
import DeleteDocForm from "../DeleteDocForm";
import {
    deleteDocAction,
    revokeDocShareAction,
    setSharePasswordAction,
    clearSharePasswordAction,
} from "../actions";
import SharesTableClient, { type ShareRow as ShareRowClient } from "./SharesTableClient";
import UploadPanel from "./UploadPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocRow = {
    id: string;
    title: string | null;
    created_at: string;
    alias: string | null;
};

type ShareRow = {
    token: string; // uuid text
    doc_id: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    views_count: number | null;
    revoked_at: string | null;
    doc_title: string | null;
    alias: string | null;
    has_password: boolean;
};

type AccessRow = {
    accessed_at: string;
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    share_id: string | null;
    email_used: string | null;
    ip: string | null;
    device_hash: string | null;
    user_agent: string | null;
};

export default async function AdminDashboardPage() {
    const ok = await isOwnerAdmin();
    if (!ok) redirect("/api/auth/signin");

    const docs = (await sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias
    from docs d
    left join doc_aliases a on a.doc_id = d.id
    order by d.created_at desc
  `) as unknown as DocRow[];

    const shares = (await sql`
    select
      s.token::text as token,
      s.doc_id::text as doc_id,
      s.to_email,
      s.created_at::text as created_at,
      s.expires_at::text as expires_at,
      s.max_views,
      s.views_count,
      s.revoked_at::text as revoked_at,
      (s.password_hash is not null) as has_password,
      d.title as doc_title,
      a.alias
    from share_tokens s
    join docs d on d.id = s.doc_id
    left join doc_aliases a on a.doc_id = s.doc_id
    order by s.created_at desc
    limit 500
  `) as unknown as ShareRow[];

    // Recent access logs (best-effort; table may not exist in older envs)
    let access: AccessRow[] = [];
    try {
        access = (await sql`
      select
        l.accessed_at::text as accessed_at,
        l.doc_id::text as doc_id,
        d.title as doc_title,
        l.alias::text as alias,
        l.share_id::text as share_id,
        l.email_used::text as email_used,
        l.ip::text as ip,
        l.device_hash::text as device_hash,
        l.user_agent::text as user_agent
      from public.doc_access_logs l
      join public.docs d on d.id = l.doc_id
      order by l.accessed_at desc
      limit 200
    `) as unknown as AccessRow[];
    } catch {
        access = [];
    }

    // Summary metrics (best-effort)
    let accessSummary: { total: number; uniques: number; last: string | null } = {
        total: 0,
        uniques: 0,
        last: null,
    };
    try {
        const rows = (await sql`
      select
        count(*)::int as total,
        count(distinct coalesce(device_hash, ''))::int as uniques,
        max(accessed_at)::text as last
      from public.doc_access_logs
    `) as unknown as Array<{ total: number; uniques: number; last: string | null }>;
        if (rows?.[0]) accessSummary = rows[0];
    } catch {
        // ignore
    }

    const sharesClient: ShareRowClient[] = shares.map((s) => ({
        token: s.token,
        doc_id: s.doc_id,
        to_email: s.to_email,
        created_at: s.created_at,
        expires_at: s.expires_at,
        max_views: s.max_views,
        view_count: Number(s.views_count ?? 0),
        revoked_at: s.revoked_at,
        doc_title: s.doc_title,
        alias: s.alias,
        has_password: Boolean((s as any).has_password),
    }));

    return (
        <main className="mx-auto max-w-6xl px-4 py-12">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Admin dashboard</h1>
                    <p className="mt-1 text-sm text-neutral-400">Owner-only tools.</p>
                </div>

                <Link
                    href="/admin"
                    className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                >
                    Back to Admin
                </Link>
            </div>

            {/* ✅ UPLOAD */}
            <UploadPanel />

            {/* DOCS */}
            <div className="mt-8 overflow-hidden rounded-lg border border-neutral-800">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-900 text-neutral-300">
                        <tr>
                            <th className="px-4 py-3 text-left">Title</th>
                            <th className="px-4 py-3 text-left">Alias</th>
                            <th className="px-4 py-3 text-left">Created</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {docs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-neutral-400">
                                    No documents found.
                                </td>
                            </tr>
                        ) : (
                            docs.map((doc) => (
                                <tr key={doc.id} className="border-t border-neutral-800">
                                    <td className="px-4 py-3">
                                        {doc.title || "Untitled"}
                                        <div className="text-xs text-neutral-500 font-mono">{doc.id}</div>
                                    </td>

                                    <td className="px-4 py-3">
                                        {doc.alias ? (
                                            <Link
                                                href={`/d/${doc.alias}`}
                                                className="text-blue-400 hover:underline"
                                                target="_blank"
                                            >
                                                {doc.alias}
                                            </Link>
                                        ) : (
                                            <span className="text-neutral-500">—</span>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 text-neutral-400">
                                        {new Date(doc.created_at).toLocaleString()}
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                        <DeleteDocForm
                                            docId={doc.id}
                                            title={doc.title || "Untitled"}
                                            action={deleteDocAction}
                                        />
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* SHARES */}
            <div className="mt-10">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Shares</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Token, recipient, expiration, max views, views, password, revoke.
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                        Showing latest {Math.min(sharesClient.length, 500)}
                    </div>
                </div>

                <SharesTableClient
                    shares={sharesClient}
                    revokeAction={revokeDocShareAction}
                    setPasswordAction={setSharePasswordAction}
                    clearPasswordAction={clearSharePasswordAction}
                />
            </div>

            {/* VIEWS / AUDIT */}
            <div className="mt-12">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">Views / audit</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                            Latest access logs (best-effort). This is what makes the product feel “in control”.
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">
                        Total: {accessSummary.total} · Unique devices: {accessSummary.uniques}
                        {accessSummary.last ? (
                            <> · Last: {new Date(accessSummary.last).toLocaleString()}</>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-900 text-neutral-300">
                            <tr>
                                <th className="px-4 py-3 text-left">When</th>
                                <th className="px-4 py-3 text-left">Doc</th>
                                <th className="px-4 py-3 text-left">Alias</th>
                                <th className="px-4 py-3 text-left">Share</th>
                                <th className="px-4 py-3 text-left">Email used</th>
                                <th className="px-4 py-3 text-left">IP</th>
                                <th className="px-4 py-3 text-left">Device</th>
                            </tr>
                        </thead>
                        <tbody>
                            {access.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-neutral-400">
                                        No access logs found (or table not available).
                                    </td>
                                </tr>
                            ) : (
                                access.map((r, idx) => (
                                    <tr key={`${r.doc_id}-${r.accessed_at}-${idx}`} className="border-t border-neutral-800">
                                        <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                                            {new Date(r.accessed_at).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.doc_title || "Untitled"}
                                            <div className="text-xs text-neutral-500 font-mono">{r.doc_id}</div>
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
                                        <td className="px-4 py-3">
                                            {r.share_id ? (
                                                <Link href={`/s/${r.share_id}`} target="_blank" className="text-blue-400 hover:underline">
                                                    {r.share_id}
                                                </Link>
                                            ) : (
                                                <span className="text-neutral-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-300">
                                            {r.email_used || <span className="text-neutral-500">—</span>}
                                        </td>
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
