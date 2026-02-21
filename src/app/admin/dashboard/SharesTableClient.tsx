// src/app/admin/dashboard/SharesTableClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RevokeShareForm from "./RevokeShareForm";
import SharePasswordForm from "./SharePasswordForm";
import {
    revokeDocShareAction,
    setSharePasswordAction,
    clearSharePasswordAction,
    extendShareExpirationAction,
    setShareMaxViewsAction,
    resetShareViewsCountAction,
    forceSharePasswordResetAction,
    bulkRevokeSharesAction,
    bulkExtendSharesAction,
} from "../actions";

export type ShareRow = {
    token: string;
    doc_id: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
    doc_title: string | null;
    alias: string | null;
    has_password: boolean;
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

type Status = "all" | "active" | "expired" | "maxed" | "revoked";
type StatusFilter = Status | "expiring";

function computeStatus(s: ShareRow): Exclude<Status, "all"> {
    if (s.revoked_at) return "revoked";
    if (s.expires_at && new Date(s.expires_at).getTime() <= Date.now()) return "expired";
    if (s.max_views != null && s.max_views !== 0 && s.view_count >= s.max_views) return "maxed";
    return "active";
}

function statusBadge(status: Exclude<Status, "all">) {
    switch (status) {
        case "revoked":
            return { label: "Revoked", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" };
        case "expired":
            return { label: "Expired", cls: "bg-red-500/10 text-red-300 border-red-500/20" };
        case "maxed":
            return { label: "Maxed", cls: "bg-red-500/10 text-red-300 border-red-500/20" };
        default:
            return { label: "Active", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" };
    }
}

export default function SharesTableClient(props: {
    shares: ShareRow[];
    // Server actions are imported directly in this Client Component.
    // (Next.js disallows passing functions from Server Components to Client Components.)
}) {
    const sp = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const [q, setQ] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [selected, setSelected] = useState<Record<string, boolean>>({});

    // URL -> UI (one-way sync)
    useEffect(() => {
        const nextQ = (sp.get("shareQ") || "").trim();
        const nextStatus = (sp.get("shareStatus") || "all") as StatusFilter;

        setQ(nextQ);
        setStatus(nextStatus);
    }, [sp]);

    const normalizedQ = q.trim().toLowerCase();

    const filtered = useMemo(() => {
        return props.shares.filter((s) => {
            const st = computeStatus(s);

            if (status !== "all") {
                if (status === "expiring") {
                    if (st !== "active") return false;
                    if (!s.expires_at) return false;
                    const exp = new Date(s.expires_at).getTime();
                    const now = Date.now();
                    const sevenDays = 7 * 24 * 60 * 60 * 1000;
                    if (Number.isNaN(exp)) return false;
                    if (exp <= now) return false;
                    if (exp > now + sevenDays) return false;
                } else {
                    if (st !== status) return false;
                }
            }

            if (!normalizedQ) return true;

            const hay = [
                s.to_email ?? "",
                s.token,
                s.doc_title ?? "",
                s.alias ?? "",
                s.doc_id,
                s.has_password ? "password protected" : "no password",
            ]
                .join(" ")
                .toLowerCase();

            return hay.includes(normalizedQ);
        });
    }, [props.shares, normalizedQ, status]);

    const counts = useMemo(() => {
        const c = { all: props.shares.length, active: 0, expired: 0, maxed: 0, revoked: 0 };
        for (const s of props.shares) {
            const st = computeStatus(s);
            c[st] += 1;
        }
        return c;
    }, [props.shares]);

    const expiringCount = useMemo(() => {
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        let n = 0;
        for (const s of props.shares) {
            if (computeStatus(s) !== "active") continue;
            if (!s.expires_at) continue;
            const exp = new Date(s.expires_at).getTime();
            if (Number.isNaN(exp)) continue;
            if (exp > now && exp <= now + sevenDays) n += 1;
        }
        return n;
    }, [props.shares]);

    function syncUrl(next: { shareQ?: string; shareStatus?: StatusFilter }) {
        const params = new URLSearchParams(sp.toString());

        if (next.shareQ !== undefined) {
            const v = next.shareQ.trim();
            if (v) params.set("shareQ", v);
            else params.delete("shareQ");
        }
        if (next.shareStatus !== undefined) {
            if (next.shareStatus && next.shareStatus !== "all") params.set("shareStatus", next.shareStatus);
            else params.delete("shareStatus");
        }

        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
    }

    const filteredTokens = useMemo(() => filtered.map((s) => s.token), [filtered]);
    const selectedTokens = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
    const anySelected = selectedTokens.length > 0;

    const allVisibleSelected = useMemo(() => {
        if (filteredTokens.length === 0) return false;
        return filteredTokens.every((t) => selected[t]);
    }, [filteredTokens, selected]);

    function toggleAllVisible(next: boolean) {
        setSelected((prev) => {
            const out = { ...prev };
            for (const t of filteredTokens) out[t] = next;
            return out;
        });
    }

    function downloadCsvForSelected() {
        const rows = props.shares.filter((s) => selected[s.token]);
        const header = [
            "token",
            "doc_id",
            "alias",
            "doc_title",
            "to_email",
            "created_at",
            "expires_at",
            "max_views",
            "view_count",
            "revoked_at",
            "has_password",
        ].join(",");
        const lines = rows.map((s) =>
            [
                s.token,
                s.doc_id,
                JSON.stringify(s.alias || ""),
                JSON.stringify(s.doc_title || ""),
                JSON.stringify(s.to_email || ""),
                JSON.stringify(s.created_at || ""),
                JSON.stringify(s.expires_at || ""),
                s.max_views == null ? "" : String(s.max_views),
                String(s.view_count ?? 0),
                JSON.stringify(s.revoked_at || ""),
                s.has_password ? "true" : "false",
            ].join(",")
        );
        const csv = [header, ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `shares_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="mt-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div>
                        <label className="block text-xs text-neutral-400">Search</label>
                        <input
                            value={q}
                            onChange={(e) => {
                                const v = e.target.value;
                                setQ(v);
                                syncUrl({ shareQ: v });
                            }}
                            placeholder="email, alias, title, token…"
                            className="mt-1 w-full md:w-[360px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-neutral-400">Status</label>
                        <select
                            value={status}
                            onChange={(e) => {
                                const v = e.target.value as StatusFilter;
                                setStatus(v);
                                syncUrl({ shareStatus: v });
                            }}
                            className="mt-1 w-full md:w-[180px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        >
                            <option value="all">All ({counts.all})</option>
                            <option value="active">Active ({counts.active})</option>
                            <option value="expiring">Expiring (7d) ({expiringCount})</option>
                            <option value="expired">Expired ({counts.expired})</option>
                            <option value="maxed">Maxed ({counts.maxed})</option>
                            <option value="revoked">Revoked ({counts.revoked})</option>
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setQ("");
                            setStatus("all");
                            syncUrl({ shareQ: "", shareStatus: "all" });
                        }}
                        className="md:mb-[2px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                    >
                        Clear
                    </button>
                </div>

                <div className="text-xs text-neutral-500">
                    Showing <span className="text-neutral-300">{filtered.length}</span> of{" "}
                    <span className="text-neutral-300">{props.shares.length}</span>
                </div>
            </div>

            {/* Table */}
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
                                        aria-label="Select all visible shares"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left">Recipient</th>
                                <th className="px-4 py-3 text-left">Token</th>
                                <th className="px-4 py-3 text-left">Doc</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Expires</th>
                                <th className="px-4 py-3 text-right">Max</th>
                                <th className="px-4 py-3 text-right">Views</th>
                                <th className="px-4 py-3 text-right">Password</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-6 text-neutral-400">
                                        No shares match your filters.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((s) => {
                                    const st = computeStatus(s);
                                    const badge = statusBadge(st);

                                    const tokenShort =
                                        s.token.length > 16 ? `${s.token.slice(0, 8)}…${s.token.slice(-4)}` : s.token;

                                    return (
                                        <tr key={s.token} className="border-t border-neutral-800">
                                            <td className="px-4 py-3 align-top">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selected[s.token]}
                                                    onChange={(e) =>
                                                        setSelected((prev) => ({ ...prev, [s.token]: e.target.checked }))
                                                    }
                                                    aria-label={`Select ${s.token}`}
                                                />
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="text-neutral-200">
                                                    {s.to_email || <span className="text-neutral-500">(public)</span>}
                                                </div>
                                                <div className="text-xs text-neutral-500">{fmtDate(s.created_at)}</div>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="font-mono text-xs text-neutral-200">{tokenShort}</div>
                                                <div className="mt-1 text-xs text-neutral-500">
                                                    <Link href={`/s/${s.token}`} target="_blank" className="text-blue-400 hover:underline">
                                                        Open
                                                    </Link>
                                                    <span className="text-neutral-700"> · </span>
                                                    <Link
                                                        href={`/s/${s.token}/raw`}
                                                        target="_blank"
                                                        className="text-blue-400 hover:underline"
                                                    >
                                                        Raw
                                                    </Link>
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
                                                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badge.cls}`}
                                                >
                                                    {badge.label}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3 text-neutral-400">{fmtDate(s.expires_at)}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{maxLabel(s.max_views)}</td>
                                            <td className="px-4 py-3 text-right text-neutral-200">{s.view_count ?? 0}</td>

                                            <td className="px-4 py-3 text-right">
                                                <SharePasswordForm
                                                    token={s.token}
                                                    hasPassword={Boolean(s.has_password)}
                                                    setAction={setSharePasswordAction}
                                                    clearAction={clearSharePasswordAction}
                                                />
                                            </td>

                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const link = `${window.location.origin}/s/${encodeURIComponent(s.token)}`;
                                                            await navigator.clipboard.writeText(link);
                                                        }}
                                                        className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                    >
                                                        Copy
                                                    </button>

                                                    <form action={extendShareExpirationAction}>
                                                        <input type="hidden" name="token" value={s.token} />
                                                        <input type="hidden" name="days" value="7" />
                                                        <button
                                                            type="submit"
                                                            disabled={!!s.revoked_at}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                                                        >
                                                            +7d
                                                        </button>
                                                    </form>

                                                    <form action={extendShareExpirationAction}>
                                                        <input type="hidden" name="token" value={s.token} />
                                                        <input type="hidden" name="days" value="30" />
                                                        <button
                                                            type="submit"
                                                            disabled={!!s.revoked_at}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                                                        >
                                                            +30d
                                                        </button>
                                                    </form>

                                                    <form action={resetShareViewsCountAction}>
                                                        <input type="hidden" name="token" value={s.token} />
                                                        <button
                                                            type="submit"
                                                            disabled={!!s.revoked_at}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                                                        >
                                                            Reset views
                                                        </button>
                                                    </form>

                                                    <form action={forceSharePasswordResetAction}>
                                                        <input type="hidden" name="token" value={s.token} />
                                                        <button
                                                            type="submit"
                                                            disabled={!!s.revoked_at}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                                                        >
                                                            Clear pw
                                                        </button>
                                                    </form>

                                                    <form
                                                        action={setShareMaxViewsAction}
                                                        onSubmit={(e) => {
                                                            const input =
                                                                (e.currentTarget.querySelector(
                                                                    'input[name="maxViews"]'
                                                                ) as HTMLInputElement) || null;
                                                            if (!input) return;

                                                            const v = window.prompt(
                                                                "Set max views (number). Use 0 for unlimited. Leave blank to clear.",
                                                                s.max_views == null ? "" : String(s.max_views)
                                                            );
                                                            if (v === null) {
                                                                e.preventDefault();
                                                                return;
                                                            }
                                                            input.value = v.trim();
                                                        }}
                                                    >
                                                        <input type="hidden" name="token" value={s.token} />
                                                        <input type="hidden" name="maxViews" defaultValue="" />
                                                        <button
                                                            type="submit"
                                                            disabled={!!s.revoked_at}
                                                            className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                                                        >
                                                            Set max
                                                        </button>
                                                    </form>

                                                    <RevokeShareForm token={s.token} revoked={Boolean(s.revoked_at)} action={revokeDocShareAction} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bulk actions */}
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-neutral-500">
                    Selected: <span className="text-neutral-200">{selectedTokens.length}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                    <form
                        action={bulkRevokeSharesAction}
                        onSubmit={(e) => {
                            if (!anySelected) e.preventDefault();
                        }}
                    >
                        <input type="hidden" name="tokens" value={JSON.stringify(selectedTokens)} />
                        <button
                            type="submit"
                            disabled={!anySelected}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                        >
                            Revoke selected
                        </button>
                    </form>

                    <form
                        action={bulkExtendSharesAction}
                        onSubmit={(e) => {
                            if (!anySelected) {
                                e.preventDefault();
                                return;
                            }
                            const days = window.prompt("Extend expiration by how many days?", "7");
                            if (days === null) {
                                e.preventDefault();
                                return;
                            }
                            const d = (e.currentTarget.querySelector('input[name="days"]') as HTMLInputElement) || null;
                            if (d) d.value = days.trim();
                        }}
                    >
                        <input type="hidden" name="tokens" value={JSON.stringify(selectedTokens)} />
                        <input type="hidden" name="days" defaultValue="7" />
                        <button
                            type="submit"
                            disabled={!anySelected}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-40"
                        >
                            Extend selected…
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
