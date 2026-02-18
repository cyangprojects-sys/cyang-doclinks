// src/app/admin/dashboard/SharesTableClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import RevokeShareForm from "./RevokeShareForm";
import SharePasswordForm from "./SharePasswordForm";

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
    revokeAction: (formData: FormData) => Promise<void>;
    setPasswordAction: (formData: FormData) => Promise<void>;
    clearPasswordAction: (formData: FormData) => Promise<void>;
}) {
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<Status>("all");

    const normalizedQ = q.trim().toLowerCase();

    const filtered = useMemo(() => {
        return props.shares.filter((s) => {
            const st = computeStatus(s);

            if (status !== "all" && st !== status) return false;

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

    return (
        <div className="mt-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div>
                        <label className="block text-xs text-neutral-400">Search</label>
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="email, alias, title, token…"
                            className="mt-1 w-full md:w-[360px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-neutral-400">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as Status)}
                            className="mt-1 w-full md:w-[180px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        >
                            <option value="all">All ({counts.all})</option>
                            <option value="active">Active ({counts.active})</option>
                            <option value="expired">Expired ({counts.expired})</option>
                            <option value="maxed">Maxed ({counts.maxed})</option>
                            <option value="revoked">Revoked ({counts.revoked})</option>
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setQ("");
                            setStatus("all");
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
                            <th className="px-4 py-3 text-right">Password</th>
                            <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-6 text-neutral-400">
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
                                        <td className="px-4 py-3 text-neutral-200">{s.to_email || "—"}</td>

                                        <td className="px-4 py-3">
                                            <div className="font-mono text-xs text-neutral-200">{tokenShort}</div>
                                            <div className="mt-1 text-xs text-neutral-500">
                                                <Link href={`/s/${s.token}`} target="_blank" className="text-blue-400 hover:underline">
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
                                                    <Link href={`/d/${s.alias}`} target="_blank" className="text-blue-400 hover:underline">
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
                                        <td className="px-4 py-3 text-right text-neutral-200">{s.view_count}</td>

                                        <td className="px-4 py-3 text-right">
                                            <SharePasswordForm
                                                token={s.token}
                                                hasPassword={Boolean(s.has_password)}
                                                setAction={props.setPasswordAction}
                                                clearAction={props.clearPasswordAction}
                                            />
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            <RevokeShareForm
                                                token={s.token}
                                                revoked={Boolean(s.revoked_at)}
                                                action={props.revokeAction}
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
    );
}
