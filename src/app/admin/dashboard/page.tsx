// src/app/admin/dashboard/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";
import DeleteDocForm from "../DeleteDocForm";
import { deleteDocAction, revokeDocShareAction } from "../actions";
import RevokeShareForm from "./RevokeShareForm";

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
    view_count: number | null;
    revoked_at: string | null;
    doc_title: string | null;
    alias: string | null;
};

function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
}

function maxLabel(n: number | null) {
    if (n === null) return "—";
    if (n === 0) return "∞";
    return String(n);
}

function statusFor(s: {
    revoked_at: string | null;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
}) {
    if (s.revoked_at)
        return { label: "Revoked", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" };

    if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now())
        return { label: "Expired", cls: "bg-red-500/10 text-red-300 border-red-500/20" };

    const max = s.max_views;
    if (max != null && max !== 0 && s.view_count >= max)
        return { label: "Maxed", cls: "bg-red-500/10 text-red-300 border-red-500/20" };

    return { label: "Active", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" };
}

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
      s.view_count,
      s.revoked_at::text as revoked_at,
      d.title as doc_title,
      a.alias
    from doc_shares s
    join docs d on d.id = s.doc_id
    left join doc_aliases a on a.doc_id = s.doc_id
    order by s.created_at desc
    limit 200
  `) as unknown as ShareRow[];

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
                            Token, recipient, expiration, max views, views, revoke.
                        </p>
                    </div>
                    <div className="text-xs text-neutral-500">Showing latest {Math.min(shares.length, 200)}</div>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-900 text-neutral-300">
                            <tr>
                                <th className="px-4 py-3 text-left">Recipient</th>
                                <th className="px-4 py-3 text-left">Token</th>
                                <th className="px-4 py-3 text-left">Doc</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Expires</th>
                                <th className="px-4 py-3 text-right">Max</th>
                                <th className="px-4 py-3 text-right">Views</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shares.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-6 text-neutral-400">
                                        No shares found.
                                    </td>
                                </tr>
                            ) : (
                                shares.map((s) => {
                                    const viewCount = Number(s.view_count ?? 0);
                                    const st = statusFor({
                                        revoked_at: s.revoked_at,
                                        expires_at: s.expires_at,
                                        max_views: s.max_views,
                                        view_count: viewCount,
                                    });

                                    const tokenShort =
                                        s.token.length > 16 ? `${s.token.slice(0, 8)}…${s.token.slice(-4)}` : s.token;

                                    return (
                                        <tr key={s.token} className="border-t border-neutral-800">
                                            <td className="px-4 py-3 text-neutral-200">{s.to_email || "—"}</td>

                                            <td className="px-4 py-3">
                                                <div className="font-mono text-xs text-neutral-200">{tokenShort}</div>
                                                <div className="mt-1 text-xs text-neutral-500">
                                                    <Link
                                                        href={`/s/${s.token}`}
                                                        target="_blank"
                                                        className="text-blue-400 hover:underline"
                                                    >
                                                        Open
                                                    </Link>
                                                    <span className="text-neutral-700"> · </span>
                                                    <span className="text-neutral-500">Created: {fmtDate(s.created_at)}</span>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="text-neutral-200">{s.doc_title || "Untitled"}</div>
                                                <div className="mt-1 text-xs text-neutral-500">
                                                    {s.alias ? (
                                                        <Link
                                                            href={`/d/${s.alias}`}
                                                            target="_blank"
                                                            className="text-blue-400 hover:underline"
                                                        >
                                                            /d/{s.alias}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-neutral-500 font-mono">{s.doc_id}</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${st.cls}`}
                                                >
                                                    {st.label}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3 text-neutral-400">{fmtDate(s.expires_at)}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{maxLabel(s.max_views)}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{viewCount}</td>

                                            <td className="px-4 py-3 text-right">
                                                <RevokeShareForm
                                                    token={s.token}
                                                    revoked={Boolean(s.revoked_at)}
                                                    action={revokeDocShareAction}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    );
}
