"use client";

import { useMemo, useState, useTransition } from "react";
import {
    createAndEmailShareToken,
    getShareStatsByToken,
    revokeShareToken,
} from "./actions";
import type { CreateShareResult, ShareRow, ShareStatsResult } from "./actions";

function fmtIso(iso: string | null) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        return d.toLocaleString();
    } catch {
        return iso;
    }
}

type Props = {
    docId: string;
    alias: string;
    docTitle?: string;
    initialShares?: ShareRow[];
};

export default function SharePanel({
    docId,
    alias,
    docTitle = "Document",
    initialShares = [],
}: Props) {
    const [shares, setShares] = useState<ShareRow[]>(initialShares);
    const [selectedToken, setSelectedToken] = useState<string | null>(
        initialShares[0]?.token ?? null
    );
    const [stats, setStats] = useState<ShareStatsResult | null>(null);
    const [busy, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const shareUrl = useMemo(() => {
        if (!selectedToken) return null;
        return `${typeof window !== "undefined" ? window.location.origin : ""}/d/${alias}?t=${selectedToken}`;
    }, [alias, selectedToken]);

    async function onCreateToken() {
        setErr(null);
        startTransition(async () => {
            try {
                const fd = new FormData();
                fd.set("docId", docId);
                fd.set("toEmail", ""); // optional
                fd.set("expiresAt", ""); // optional
                fd.set("maxViews", ""); // optional
                // fd.set("password", ""); // optional if you add password support

                const res: CreateShareResult = await createAndEmailShareToken(fd);

                if (!res.ok) {
                    setErr(res.message || res.error || "Failed to create token.");
                    return;
                }

                // Append the created token row if server returned it, otherwise refresh by loading stats later.
                // We assume your action returns `share` or `row` OR enough to display token.
                // If your CreateShareResult shape differs, this safely falls back to minimal row.
                const newRow: ShareRow =
                    (res as any).share ??
                    (res as any).row ?? {
                        token: res.token,
                        to_email: (res as any).to_email ?? null,
                        created_at: (res as any).created_at ?? new Date().toISOString(),
                        expires_at: (res as any).expires_at ?? null,
                        max_views: (res as any).max_views ?? null,
                        view_count: (res as any).view_count ?? 0,
                        revoked_at: (res as any).revoked_at ?? null,
                    };

                setShares((prev) => [newRow, ...prev]);
                setSelectedToken(newRow.token);
                setStats(null);
            } catch (e: any) {
                setErr(e?.message || "Unexpected error creating share token.");
            }
        });
    }

    async function onLoadStats(token: string) {
        setErr(null);
        startTransition(async () => {
            try {
                const res: ShareStatsResult = await getShareStatsByToken(token);
                if (!res.ok) {
                    setErr(res.message || res.error || "Failed to load stats.");
                    setStats(null);
                    return;
                }
                setStats(res);
            } catch (e: any) {
                setErr(e?.message || "Unexpected error loading stats.");
                setStats(null);
            }
        });
    }

    async function onRevoke(token: string) {
        setErr(null);
        startTransition(async () => {
            try {
                const res = await revokeShareToken(token);
                if (!res.ok) {
                    setErr(res.message || res.error || "Failed to revoke token.");
                    return;
                }
                // Update local list (mark revoked)
                setShares((prev) =>
                    prev.map((r) =>
                        r.token === token
                            ? { ...r, revoked_at: new Date().toISOString() }
                            : r
                    )
                );
                if (selectedToken === token) setStats(null);
            } catch (e: any) {
                setErr(e?.message || "Unexpected error revoking token.");
            }
        });
    }

    return (
        <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Owner share controls</h2>
                    <p className="text-sm text-neutral-600">
                        {docTitle} · alias <span className="font-mono">/d/{alias}</span>
                    </p>
                </div>

                <button
                    onClick={onCreateToken}
                    disabled={busy || !docId}
                    className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    title={!docId ? "docId missing" : ""}
                >
                    {busy ? "Working…" : "Create share token"}
                </button>
            </div>

            {err ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {err}
                </div>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-neutral-200 p-3">
                    <h3 className="mb-2 text-sm font-semibold">Tokens</h3>

                    {shares.length === 0 ? (
                        <p className="text-sm text-neutral-600">No tokens yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {shares.map((r) => {
                                const isSelected = r.token === selectedToken;
                                const revoked = !!r.revoked_at;
                                return (
                                    <li
                                        key={r.token}
                                        className={`rounded-lg border p-2 ${isSelected
                                                ? "border-black"
                                                : "border-neutral-200 hover:border-neutral-400"
                                            }`}
                                    >
                                        <div classNam
