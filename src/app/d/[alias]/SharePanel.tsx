// src/app/d/[alias]/SharePanel.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { createAndEmailShareToken, getShareStatsByToken, revokeShareToken } from "./actions.server";
import type { CreateShareResult } from "./actions.types";

type ShareRow = {
    token: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
    has_password: boolean;
};

function fmtDate(s: string | null) {
    if (!s) return "—";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString();
}

export default function SharePanel(props: { docId: string; alias: string }) {
    const [toEmail, setToEmail] = useState("");
    const [expiresInHours, setExpiresInHours] = useState<string>("");
    const [maxViews, setMaxViews] = useState<string>("");
    const [busy, startTransition] = useTransition();

    const [created, setCreated] = useState<CreateShareResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [lookupToken, setLookupToken] = useState("");
    const [stats, setStats] = useState<ShareRow | null>(null);
    const [statsErr, setStatsErr] = useState<string | null>(null);

    const canCreate = useMemo(() => {
        if (busy) return false;
        if (!props.docId) return false;
        return true;
    }, [busy, props.docId]);

    function onCreate() {
        setError(null);
        setCreated(null);

        const exp = expiresInHours.trim() ? Number(expiresInHours) : undefined;
        const mv = maxViews.trim() ? Number(maxViews) : undefined;

        startTransition(async () => {
            const res = await createAndEmailShareToken({
                doc_id: props.docId,
                alias: props.alias,
                to_email: toEmail.trim() || undefined,
                expires_in_hours: Number.isFinite(exp as any) ? (exp as number) : undefined,
                max_views: Number.isFinite(mv as any) ? (mv as number) : undefined,
            });

            setCreated(res);
            if (!res.ok) setError(res.message || res.error);
            if (res.ok) setLookupToken(res.token);
        });
    }

    function onLookup() {
        setStats(null);
        setStatsErr(null);

        const t = lookupToken.trim();
        if (!t) {
            setStatsErr("Enter a token.");
            return;
        }

        startTransition(async () => {
            const res = await getShareStatsByToken(t);
            if (!res.ok) {
                setStatsErr(res.message || res.error);
                return;
            }
            setStats({
                token: res.token,
                to_email: res.to_email,
                created_at: res.created_at,
                expires_at: res.expires_at,
                max_views: res.max_views,
                view_count: res.view_count,
                revoked_at: res.revoked_at,
                has_password: res.has_password,
            });
        });
    }

    function onRevoke() {
        setStatsErr(null);

        const t = lookupToken.trim();
        if (!t) {
            setStatsErr("Enter a token.");
            return;
        }

        startTransition(async () => {
            const res = await revokeShareToken(t);
            if (!res.ok) {
                setStatsErr(res.message || res.error);
                return;
            }
            // refresh stats after revoke
            const after = await getShareStatsByToken(t);
            if (after.ok) {
                setStats({
                    token: after.token,
                    to_email: after.to_email,
                    created_at: after.created_at,
                    expires_at: after.expires_at,
                    max_views: after.max_views,
                    view_count: after.view_count,
                    revoked_at: after.revoked_at,
                    has_password: after.has_password,
                });
            }
        });
    }

    return (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-lg font-semibold">Share Tokens</div>
            <div className="mt-1 text-sm text-neutral-600">
                Create emailable share links with expiration / view limits, and revoke them.
            </div>

            <div className="mt-4 grid gap-3">
                <div className="grid gap-2 md:grid-cols-3">
                    <div className="grid gap-1">
                        <label className="text-xs font-medium text-neutral-700">To email (optional)</label>
                        <input
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="someone@example.com"
                        />
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs font-medium text-neutral-700">Expires in hours (optional)</label>
                        <input
                            value={expiresInHours}
                            onChange={(e) => setExpiresInHours(e.target.value)}
                            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="72"
                            inputMode="numeric"
                        />
                    </div>

                    <div className="grid gap-1">
                        <label className="text-xs font-medium text-neutral-700">Max views (optional)</label>
                        <input
                            value={maxViews}
                            onChange={(e) => setMaxViews(e.target.value)}
                            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="10"
                            inputMode="numeric"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        disabled={!canCreate}
                        onClick={onCreate}
                        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {busy ? "Working…" : "Create token"}
                    </button>

                    {error ? <div className="text-sm text-red-600">{error}</div> : null}
                    {created?.ok ? (
                        <div className="text-sm text-neutral-700">
                            Created:{" "}
                            <a className="underline" href={created.share_url} target="_blank" rel="noreferrer">
                                {created.share_url}
                            </a>
                        </div>
                    ) : null}
                </div>

                <hr className="my-2 border-neutral-200" />

                <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
                    <div className="grid gap-1">
                        <label className="text-xs font-medium text-neutral-700">Token</label>
                        <input
                            value={lookupToken}
                            onChange={(e) => setLookupToken(e.target.value)}
                            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="uuid token"
                        />
                    </div>

                    <button
                        disabled={busy}
                        onClick={onLookup}
                        className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                        Lookup
                    </button>

                    <button
                        disabled={busy}
                        onClick={onRevoke}
                        className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                    >
                        Revoke
                    </button>
                </div>

                {statsErr ? <div className="text-sm text-red-600">{statsErr}</div> : null}

                {stats ? (
                    <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                        <div className="grid gap-1 md:grid-cols-2">
                            <div>
                                <span className="font-medium">Created:</span> {fmtDate(stats.created_at)}
                            </div>
                            <div>
                                <span className="font-medium">To:</span> {stats.to_email || "—"}
                            </div>
                            <div>
                                <span className="font-medium">Expires:</span> {fmtDate(stats.expires_at)}
                            </div>
                            <div>
                                <span className="font-medium">Max views:</span> {stats.max_views ?? "—"}
                            </div>
                            <div>
                                <span className="font-medium">Views:</span> {stats.view_count}
                            </div>
                            <div>
                                <span className="font-medium">Revoked:</span> {fmtDate(stats.revoked_at)}
                            </div>
                            <div>
                                <span className="font-medium">Password:</span> {stats.has_password ? "Yes" : "No"}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
