// src/app/d/[alias]/SharePanel.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { createAndEmailShareToken, getShareStatsByToken, revokeShareToken } from "./actions";
import type { CreateShareResult } from "./actions";

type ShareRow = {
    token: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
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

function viewsLeft(viewCount: number, maxViews: number | null) {
    if (maxViews === null || maxViews === 0) return "Unlimited";
    return String(Math.max(0, maxViews - viewCount));
}

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export default function SharePanel(props: {
    alias: string;
    docTitle: string;
    initialShares: ShareRow[];
}) {
    const { alias, docTitle } = props;

    const [toEmail, setToEmail] = useState("");
    const [expiresHours, setExpiresHours] = useState<string>("72");
    const [maxViews, setMaxViews] = useState<string>("3");

    const [busy, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [created, setCreated] = useState<CreateShareResult | null>(null);
    const [shares, setShares] = useState<ShareRow[]>(props.initialShares);

    const origin =
        typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";

    const createdViewsLeft = useMemo(() => {
        if (!created || !created.ok) return null;
        return viewsLeft(created.view_count, created.max_views);
    }, [created]);

    function normalizeNum(s: string) {
        const t = s.trim();
        if (t === "") return null;
        const n = Number(t);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.floor(n));
    }

    function onCreate() {
        setError(null);
        setCreated(null);

        const exp = normalizeNum(expiresHours);
        const max = normalizeNum(maxViews);

        startTransition(async () => {
            const res = await createAndEmailShareToken({
                alias,
                to_email: toEmail,
                expires_hours: exp,
                max_views: max,
            });

            setCreated(res);

            if (!res.ok) {
                setError(res.message || res.error);
                return;
            }

            setShares((prev) => [
                {
                    token: res.token,
                    to_email: toEmail.trim().toLowerCase(),
                    created_at: new Date().toISOString(),
                    expires_at: res.expires_at,
                    max_views: res.max_views,
                    view_count: res.view_count,
                    revoked_at: null,
                },
                ...prev,
            ]);

            setToEmail("");
        });
    }

    function onRevoke(token: string) {
        setError(null);
        startTransition(async () => {
            const res = await revokeShareToken({ alias, token });
            if (!res.ok) {
                setError(res.message || res.error);
                return;
            }
            setShares((prev) =>
                prev.map((s) => (s.token === token ? { ...s, revoked_at: new Date().toISOString() } : s))
            );
        });
    }

    function onRefreshStats(token: string) {
        setError(null);
        startTransition(async () => {
            const res = await getShareStatsByToken(token);
            if (!res.ok) {
                setError(res.message || res.error);
                return;
            }
            setShares((prev) =>
                prev.map((s) =>
                    s.token === token
                        ? {
                            ...s,
                            view_count: res.view_count,
                            max_views: res.max_views,
                            expires_at: res.expires_at,
                            revoked_at: res.revoked_at,
                        }
                        : s
                )
            );
        });
    }

    return (
        <section className="mt-8 rounded-xl border border-neutral-800 overflow-hidden">
            <div className="bg-neutral-950 px-4 py-3">
                <div className="text-sm font-medium text-neutral-200">Share</div>
                <div className="text-xs text-neutral-500">
                    Create a limited link and email it to a recipient.
                </div>
            </div>

            <div className="p-4 space-y-4">
                {error ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs text-neutral-400">Recipient email</label>
                        <input
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-neutral-400">Expires (hours)</label>
                        <input
                            value={expiresHours}
                            onChange={(e) => setExpiresHours(e.target.value)}
                            placeholder="72"
                            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        />
                        <div className="mt-1 text-[11px] text-neutral-500">0 = no expiration</div>
                    </div>

                    <div>
                        <label className="block text-xs text-neutral-400">Max views</label>
                        <input
                            value={maxViews}
                            onChange={(e) => setMaxViews(e.target.value)}
                            placeholder="3"
                            className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-neutral-600"
                        />
                        <div className="mt-1 text-[11px] text-neutral-500">0 = unlimited</div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-neutral-500">
                        Document: <span className="text-neutral-300">{docTitle}</span>
                    </div>

                    <button
                        onClick={onCreate}
                        disabled={busy || !toEmail.trim()}
                        className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {busy ? "Creating…" : "Create & Email"}
                    </button>
                </div>

                {created && created.ok ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium text-neutral-200">Share created</div>
                                <div className="mt-1 text-xs text-neutral-500">
                                    Expires: <span className="text-neutral-300">{fmtDate(created.expires_at)}</span> ·
                                    Max: <span className="text-neutral-300">{maxLabel(created.max_views)}</span> ·
                                    Views: <span className="text-neutral-300">{created.view_count}</span> ·
                                    Left: <span className="text-neutral-300">{createdViewsLeft}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <a
                                    href={created.share_url}
                                    target="_blank"
                                    className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                >
                                    Open
                                </a>
                                <button
                                    onClick={() => copy(created.share_url)}
                                    className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                >
                                    Copy link
                                </button>
                                <button
                                    onClick={() => copy(created.token)}
                                    className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                >
                                    Copy token
                                </button>
                            </div>
                        </div>

                        <div className="mt-3 rounded-lg border border-neutral-800 bg-black/20 px-3 py-2 font-mono text-xs text-neutral-200 break-all">
                            {created.share_url}
                        </div>
                    </div>
                ) : null}

                <div className="pt-2">
                    <div className="text-sm font-medium text-neutral-200">Recent shares</div>
                    <div className="mt-2 overflow-hidden rounded-lg border border-neutral-800">
                        <table className="w-full text-sm">
                            <thead className="bg-neutral-900 text-neutral-300">
                                <tr>
                                    <th className="px-4 py-3 text-left">Recipient</th>
                                    <th className="px-4 py-3 text-left">Token</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-left">Expires</th>
                                    <th className="px-4 py-3 text-right">Max</th>
                                    <th className="px-4 py-3 text-right">Views</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shares.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-6 text-neutral-400">
                                            No shares yet.
                                        </td>
                                    </tr>
                                ) : (
                                    shares.map((s) => {
                                        const st = statusFor(s);
                                        const linkPath = `/s/${s.token}`;
                                        const linkAbs = origin ? `${origin}${linkPath}` : linkPath;

                                        const tokenShort =
                                            s.token.length > 12 ? `${s.token.slice(0, 8)}…${s.token.slice(-4)}` : s.token;

                                        return (
                                            <tr key={s.token} className="border-t border-neutral-800">
                                                <td className="px-4 py-3 text-neutral-200">{s.to_email || "—"}</td>

                                                <td className="px-4 py-3">
                                                    <div className="font-mono text-xs text-neutral-200">{tokenShort}</div>
                                                    <div className="mt-1 text-xs text-neutral-500">
                                                        Created: {fmtDate(s.created_at)}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${st.cls}`}
                                                    >
                                                        {st.label}
                                                    </span>
                                                    <div className="mt-1 text-xs text-neutral-500">
                                                        Left: {viewsLeft(s.view_count, s.max_views)}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 text-neutral-400">{fmtDate(s.expires_at)}</td>

                                                <td className="px-4 py-3 text-right text-neutral-200">
                                                    {maxLabel(s.max_views)}
                                                </td>

                                                <td className="px-4 py-3 text-right text-neutral-200">{s.view_count}</td>

                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex items-center gap-2">
                                                        <a
                                                            href={linkPath}
                                                            target="_blank"
                                                            className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                        >
                                                            Open
                                                        </a>
                                                        <button
                                                            onClick={() => copy(linkAbs)}
                                                            className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900"
                                                        >
                                                            Copy
                                                        </button>
                                                        <button
                                                            onClick={() => onRefreshStats(s.token)}
                                                            disabled={busy}
                                                            className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
                                                        >
                                                            Refresh
                                                        </button>
                                                        <button
                                                            onClick={() => onRevoke(s.token)}
                                                            disabled={busy || Boolean(s.revoked_at)}
                                                            className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title={s.revoked_at ? "Already revoked" : "Revoke this share"}
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-2 text-xs text-neutral-500">
                        Note: “Max = ∞” means unlimited. “Expires = —” means no expiration.
                    </div>
                </div>
            </div>
        </section>
    );
}
