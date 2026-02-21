// src/app/admin/dashboard/ViewsByDocTableClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    revokeAllSharesForDocAction,
    disableAliasForDocAction,
    extendAliasExpirationAction,
    bulkRevokeAllSharesForDocsAction,
    bulkDisableAliasesForDocsAction,
} from "../actions";

export type ViewsByDocRow = {
    doc_id: string;
    doc_title: string | null;
    alias: string | null;
    views: number;
    unique_ips: number;
    last_view: string | null;
};

function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
}

export default function ViewsByDocTableClient(props: {
    rows: ViewsByDocRow[];
    // Server actions are imported directly in this Client Component.
}) {
    const sp = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const [q, setQ] = useState("");
    const [limit, setLimit] = useState<number | null>(null);
    const [selected, setSelected] = useState<Record<string, boolean>>({});

    // URL -> UI
    useEffect(() => {
        const nextQ = (sp.get("viewQ") || "").trim();
        const limRaw = (sp.get("viewLimit") || "").trim();
        const lim = limRaw ? Number(limRaw) : null;
        setQ(nextQ);
        setLimit(Number.isFinite(lim as number) && (lim as number) > 0 ? (lim as number) : null);
    }, [sp]);

    const normalizedQ = q.trim().toLowerCase();

    const filtered = useMemo(() => {
        let out = props.rows;
        if (normalizedQ) {
            out = out.filter((r) => {
                const hay = [r.doc_title ?? "", r.alias ?? "", r.doc_id].join(" ").toLowerCase();
                return hay.includes(normalizedQ);
            });
        }
        if (limit != null) out = out.slice(0, limit);
        return out;
    }, [props.rows, normalizedQ, limit]);

    const filteredIds = useMemo(() => filtered.map((r) => r.doc_id), [filtered]);

    const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

    const allVisibleSelected = useMemo(() => {
        if (filteredIds.length === 0) return false;
        return filteredIds.every((id) => selected[id]);
    }, [filteredIds, selected]);

    const anySelected = selectedIds.length > 0;

    function toggleAllVisible(next: boolean) {
        setSelected((prev) => {
            const out = { ...prev };
            for (const id of filteredIds) out[id] = next;
            return out;
        });
    }

    function downloadCsvForSelected() {
        const rows = props.rows.filter((r) => selected[r.doc_id]);
        const header = ["doc_id", "doc_title", "alias", "views", "unique_ips", "last_view"].join(",");
        const lines = rows.map((r) =>
            [
                r.doc_id,
                JSON.stringify(r.doc_title || ""),
                JSON.stringify(r.alias || ""),
                String(r.views),
                String(r.unique_ips),
                JSON.stringify(r.last_view || ""),
            ].join(",")
        );
        const csv = [header, ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `docs_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function syncUrl(next: { viewQ?: string; viewLimit?: number | null }) {
        const params = new URLSearchParams(sp.toString());

        if (next.viewQ !== undefined) {
            const v = next.viewQ.trim();
            if (v) params.set("viewQ", v);
            else params.delete("viewQ");
        }
        if (next.viewLimit !== undefined) {
            if (next.viewLimit != null && next.viewLimit > 0) params.set("viewLimit", String(next.viewLimit));
            else params.delete("viewLimit");
        }

        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
    }

    return (
        <div className="mt-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div>
                        <label className="block text-xs text-neutral-400">Search</label>
                        <input
                            value={q}
                            onChange={(e) => {
                                const v = e.target.value;
                                setQ(v);
                                syncUrl({ viewQ: v });
                            }}
                            placeholder="title, alias, doc id…"
                            className="mt-1 w-full md:w-[360px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-neutral-400">Show</label>
                        <select
                            value={limit == null ? "all" : String(limit)}
                            onChange={(e) => {
                                const v = e.target.value;
                                const nextLimit = v === "all" ? null : Number(v);
                                setLimit(nextLimit);
                                syncUrl({ viewLimit: nextLimit });
                            }}
                            className="mt-1 w-full md:w-[180px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        >
                            <option value="all">All</option>
                            <option value="5">Top 5</option>
                            <option value="10">Top 10</option>
                            <option value="25">Top 25</option>
                            <option value="50">Top 50</option>
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setQ("");
                            setLimit(null);
                            syncUrl({ viewQ: "", viewLimit: null });
                        }}
                        className="md:mb-[2px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                    >
                        Clear
                    </button>
                </div>

                <div className="text-xs text-neutral-500">
                    Showing <span className="text-neutral-300">{filtered.length}</span> of{" "}
                    <span className="text-neutral-300">{props.rows.length}</span>
                </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-800">
                <div className="max-h-[560px] overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-neutral-900 text-neutral-300">
                            <tr>
                                <th className="px-4 py-3 text-left w-[44px]">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={(e) => toggleAllVisible(e.target.checked)}
                                        aria-label="Select all visible documents"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left">Doc</th>
                                <th className="px-4 py-3 text-left">Alias</th>
                                <th className="px-4 py-3 text-right">Views</th>
                                <th className="px-4 py-3 text-right">Unique IPs</th>
                                <th className="px-4 py-3 text-right">Last view</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-neutral-400">
                                        No documents match your filters.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((r) => (
                                    <tr key={r.doc_id} className="border-t border-neutral-800">
                                        <td className="px-4 py-3 align-top">
                                            <input
                                                type="checkbox"
                                                checked={!!selected[r.doc_id]}
                                                onChange={(e) =>
                                                    setSelected((prev) => ({ ...prev, [r.doc_id]: e.target.checked }))
                                                }
                                                aria-label={`Select ${r.doc_title || r.doc_id}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-neutral-200">{r.doc_title || "Untitled"}</div>
                                            <div className="text-xs text-neutral-500 font-mono">{r.doc_id}</div>
                                            <div className="mt-1 text-xs">
                                                <Link
                                                    href={`/admin/docs/${encodeURIComponent(r.doc_id)}`}
                                                    className="text-blue-400 hover:underline"
                                                >
                                                    Investigate →
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.alias ? (
                                                <Link href={`/d/${r.alias}`} target="_blank" className="text-blue-400 hover:underline">
                                                    /d/{r.alias}
                                                </Link>
                                            ) : (
                                                <span className="text-neutral-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-neutral-200">{r.views}</td>
                                        <td className="px-4 py-3 text-right text-neutral-200">{r.unique_ips}</td>
                                        <td className="px-4 py-3 text-right text-neutral-400 whitespace-nowrap">
                                            {fmtDate(r.last_view)}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const link = r.alias ? `${window.location.origin}/d/${r.alias}` : r.doc_id;
                                                        await navigator.clipboard.writeText(link);
                                                    }}
                                                    className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                >
                                                    Copy link
                                                </button>

                                                <form action={revokeAllSharesForDocAction}>
                                                    <input type="hidden" name="docId" value={r.doc_id} />
                                                    <button
                                                        type="submit"
                                                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                    >
                                                        Revoke shares
                                                    </button>
                                                </form>

                                                <form action={extendAliasExpirationAction}>
                                                    <input type="hidden" name="docId" value={r.doc_id} />
                                                    <input type="hidden" name="days" value="7" />
                                                    <button
                                                        type="submit"
                                                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                    >
                                                        +7d
                                                    </button>
                                                </form>

                                                <form action={disableAliasForDocAction}>
                                                    <input type="hidden" name="docId" value={r.doc_id} />
                                                    <button
                                                        type="submit"
                                                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                    >
                                                        Disable alias
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk actions */}
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-neutral-500">
                    Selected: <span className="text-neutral-200">{selectedIds.length}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                    <form
                        action={bulkRevokeAllSharesForDocsAction}
                        onSubmit={(e) => {
                            if (!anySelected) e.preventDefault();
                        }}
                    >
                        <input type="hidden" name="docIds" value={JSON.stringify(selectedIds)} />
                        <button
                            type="submit"
                            disabled={!anySelected}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                        >
                            Revoke all shares
                        </button>
                    </form>

                    <form
                        action={bulkDisableAliasesForDocsAction}
                        onSubmit={(e) => {
                            if (!anySelected) e.preventDefault();
                        }}
                    >
                        <input type="hidden" name="docIds" value={JSON.stringify(selectedIds)} />
                        <button
                            type="submit"
                            disabled={!anySelected}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                        >
                            Disable aliases
                        </button>
                    </form>

                    <button
                        type="button"
                        disabled={!anySelected}
                        onClick={() => {
                            if (!anySelected) return;
                            downloadCsvForSelected();
                        }}
                        className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                    >
                        Export CSV
                    </button>

                    <button
                        type="button"
                        onClick={() => setSelected({})}
                        className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                    >
                        Clear selection
                    </button>
                </div>
            </div>
        </div>
    );
}
