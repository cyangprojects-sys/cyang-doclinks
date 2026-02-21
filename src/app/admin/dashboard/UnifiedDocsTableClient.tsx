// src/app/admin/dashboard/UnifiedDocsTableClient.tsx
"use client";

import Link from "next/link";
import DeleteDocForm from "../DeleteDocForm";
import { deleteDocAction } from "../actions";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type UnifiedDocRow = {
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    total_views: number;
    last_view: string | null;
    active_shares: number;
    alias_expires_at: string | null;
    alias_is_active: boolean | null;
    alias_revoked_at: string | null;
};

function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
}

function daysUntil(s: string | null): number | null {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    const ms = d.getTime() - Date.now();
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}

type SortKey =
    | "doc_title"
    | "total_views"
    | "last_view"
    | "active_shares"
    | "alias_expires_at"
    | "status";

type SortDir = "asc" | "desc";

function statusFor(r: UnifiedDocRow): { label: string; tone: "good" | "warn" | "bad" | "muted" } {
    const now = Date.now();
    const isActive = r.alias_is_active ?? true;
    const revoked = !!r.alias_revoked_at;
    const exp = r.alias_expires_at ? new Date(r.alias_expires_at).getTime() : null;
    const expired = exp != null && Number.isFinite(exp) && exp <= now;

    if (!r.alias) return { label: "No alias", tone: "muted" };
    if (!isActive || revoked) return { label: "Disabled", tone: "bad" };
    if (expired) return { label: "Expired", tone: "bad" };

    const d = daysUntil(r.alias_expires_at);
    if (d != null && d >= 0 && d <= 3) return { label: `Expiring (${d}d)`, tone: "warn" };

    return { label: "Active", tone: "good" };
}

function Badge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "muted" }) {
    const cls =
        tone === "good"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
            : tone === "warn"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
              : tone === "bad"
                ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                : "border-neutral-700 bg-neutral-900 text-neutral-300";

    return (
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{label}</span>
    );
}

export default function UnifiedDocsTableClient(props: {
    rows: UnifiedDocRow[];
    defaultPageSize?: number;
    showDelete?: boolean;
}) {
    const sp = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const showDelete = !!props.showDelete;

    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sortKey, setSortKey] = useState<SortKey>("total_views");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    // URL -> UI
    useEffect(() => {
        const nextQ = (sp.get("docQ") || "").trim();
        const p = Number(sp.get("docPage") || "1");
        const ps = Number(sp.get("docPageSize") || String(props.defaultPageSize ?? 10));
        const sk = (sp.get("docSort") || "total_views") as SortKey;
        const sd = (sp.get("docDir") || "desc") as SortDir;

        setQ(nextQ);
        setPage(Number.isFinite(p) && p > 0 ? p : 1);
        setPageSize(Number.isFinite(ps) && ps > 0 ? ps : props.defaultPageSize ?? 10);
        setSortKey(sk);
        setSortDir(sd === "asc" ? "asc" : "desc");
    }, [sp, props.defaultPageSize]);

    function syncUrl(next: Partial<{ docQ: string; docPage: number; docPageSize: number; docSort: SortKey; docDir: SortDir }>) {
        const params = new URLSearchParams(sp.toString());
        if (next.docQ !== undefined) {
            const v = next.docQ.trim();
            if (v) params.set("docQ", v);
            else params.delete("docQ");
        }
        if (next.docPage !== undefined) params.set("docPage", String(next.docPage));
        if (next.docPageSize !== undefined) params.set("docPageSize", String(next.docPageSize));
        if (next.docSort !== undefined) params.set("docSort", next.docSort);
        if (next.docDir !== undefined) params.set("docDir", next.docDir);

        const hash = typeof window !== "undefined" ? window.location.hash : "";
        router.replace(`${pathname}?${params.toString()}${hash}`, { scroll: false });
    }

    const normalizedQ = q.trim().toLowerCase();

    const filtered = useMemo(() => {
        if (!normalizedQ) return props.rows;
        return props.rows.filter((r) => {
            const hay = [r.doc_title ?? "", r.alias ?? "", r.doc_id].join(" ").toLowerCase();
            return hay.includes(normalizedQ);
        });
    }, [props.rows, normalizedQ]);

    const sorted = useMemo(() => {
        const dir = sortDir === "asc" ? 1 : -1;
        const a = [...filtered];

        a.sort((x, y) => {
            const sx = statusFor(x).label;
            const sy = statusFor(y).label;

            const getVal = (r: UnifiedDocRow) => {
                switch (sortKey) {
                    case "doc_title":
                        return (r.doc_title || "").toLowerCase();
                    case "total_views":
                        return r.total_views || 0;
                    case "last_view":
                        return r.last_view ? new Date(r.last_view).getTime() : 0;
                    case "active_shares":
                        return r.active_shares || 0;
                    case "alias_expires_at":
                        return r.alias_expires_at ? new Date(r.alias_expires_at).getTime() : 0;
                    case "status":
                        return r.alias ? sx : "zzzz";
                }
            };

            const vx = getVal(x) as any;
            const vy = getVal(y) as any;

            if (typeof vx === "number" && typeof vy === "number") {
                if (vx === vy) return 0;
                return vx > vy ? dir : -dir;
            }

            const s1 = String(vx);
            const s2 = String(vy);
            if (s1 === s2) return 0;
            return s1 > s2 ? dir : -dir;
        });

        return a;
    }, [filtered, sortKey, sortDir]);

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const pageRows = useMemo(() => {
        const start = (safePage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [sorted, safePage, pageSize]);

    function toggleSort(k: SortKey) {
        if (k === sortKey) {
            const nextDir: SortDir = sortDir === "asc" ? "desc" : "asc";
            syncUrl({ docSort: k, docDir: nextDir, docPage: 1 });
            return;
        }
        syncUrl({ docSort: k, docDir: k === "doc_title" || k === "status" ? "asc" : "desc", docPage: 1 });
    }

    return (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950">
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2">
                    <div className="text-sm text-neutral-400">Search</div>
                    <input
                        value={q}
                        onChange={(e) => syncUrl({ docQ: e.target.value, docPage: 1 })}
                        placeholder="title, alias, doc id"
                        className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 md:w-[320px]"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    <div>
                        Rows: <span className="text-neutral-200">{total}</span>
                    </div>
                    <label className="flex items-center gap-2">
                        <span>Page size</span>
                        <select
                            value={pageSize}
                            onChange={(e) => syncUrl({ docPageSize: Number(e.target.value), docPage: 1 })}
                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-200"
                        >
                            {[10, 25, 50, 100].map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                        <tr>
                            <th className="px-4 py-3 text-left">
                                <button className="hover:underline" onClick={() => toggleSort("doc_title")} type="button">
                                    Doc name
                                </button>
                            </th>
                            <th className="px-4 py-3 text-right">
                                <button className="hover:underline" onClick={() => toggleSort("total_views")} type="button">
                                    Total views
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button className="hover:underline" onClick={() => toggleSort("last_view")} type="button">
                                    Last viewed
                                </button>
                            </th>
                            <th className="px-4 py-3 text-right">
                                <button className="hover:underline" onClick={() => toggleSort("active_shares")} type="button">
                                    Active shares
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button className="hover:underline" onClick={() => toggleSort("alias_expires_at")} type="button">
                                    Expiration date
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <button className="hover:underline" onClick={() => toggleSort("status")} type="button">
                                    Status
                                </button>
                            </th>
                            {showDelete ? (
                                <th className="px-4 py-3 text-right">Actions</th>
                            ) : null}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-neutral-400">
                                    No documents found.
                                </td>
                            </tr>
                        ) : (
                            pageRows.map((r) => {
                                const st = statusFor(r);
                                return (
                                    <tr key={r.doc_id} className="border-t border-neutral-800">
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                <Link
                                                    href={`/admin/docs/${r.doc_id}`}
                                                    className="text-neutral-100 hover:underline"
                                                    title="Open per-document detail"
                                                >
                                                    {r.doc_title || "Untitled"}
                                                </Link>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                                    <span className="font-mono">{r.doc_id}</span>
                                                    {r.alias ? (
                                                        <>
                                                            <span className="text-neutral-700">·</span>
                                                            <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                                                                /d/{r.alias}
                                                            </Link>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-neutral-200">{r.total_views ?? 0}</td>
                                        <td className="px-4 py-3 text-neutral-200">{fmtDate(r.last_view)}</td>
                                        <td className="px-4 py-3 text-right text-neutral-200">{r.active_shares ?? 0}</td>
                                        <td className="px-4 py-3 text-neutral-200">{fmtDate(r.alias_expires_at)}</td>
                                        <td className="px-4 py-3">
                                            <Badge label={st.label} tone={st.tone} />
                                        </td>
                                        {showDelete ? (
                                            <td className="px-4 py-3 text-right">
                                                <DeleteDocForm
                                                    docId={r.doc_id}
                                                    title={r.doc_title || r.alias || r.doc_id}
                                                    action={deleteDocAction}
                                                />
                                            </td>
                                        ) : null}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col gap-2 border-t border-neutral-800 p-4 text-xs text-neutral-500 md:flex-row md:items-center md:justify-between">
                <div>
                    Page <span className="text-neutral-200">{safePage}</span> / <span className="text-neutral-200">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => syncUrl({ docPage: 1 })}
                        disabled={safePage <= 1}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-200 disabled:opacity-40"
                    >
                        First
                    </button>
                    <button
                        type="button"
                        onClick={() => syncUrl({ docPage: Math.max(1, safePage - 1) })}
                        disabled={safePage <= 1}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-200 disabled:opacity-40"
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        onClick={() => syncUrl({ docPage: Math.min(totalPages, safePage + 1) })}
                        disabled={safePage >= totalPages}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-200 disabled:opacity-40"
                    >
                        Next
                    </button>
                    <button
                        type="button"
                        onClick={() => syncUrl({ docPage: totalPages })}
                        disabled={safePage >= totalPages}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-neutral-200 disabled:opacity-40"
                    >
                        Last
                    </button>
                </div>
            </div>
        </div>
    );
}
