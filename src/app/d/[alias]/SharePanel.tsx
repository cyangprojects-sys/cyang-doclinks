"use client";

import { useMemo, useState, useTransition } from "react";
import {
    createAndEmailShareToken,
    getShareStatsByToken,
    revokeShareToken,
} from "./actions";
import type { ShareRow, ShareStatsResult } from "./actions";

type Props = {
    docId: string;
    alias: string;
    docTitle?: string;
    initialShares?: ShareRow[];
};

function fmtIso(iso: string | null) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

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
    const [err, setErr] = useState<string | null>(null);
    const [busy, startTransition] = useTransition();

    const selectedRow = useMemo(
        () => shares.find((s) => s.token === selectedToken) ?? null,
        [shares, selectedToken]
    );

    function upsertRow(row: ShareRow) {
        setShares((prev) => {
            const exists = prev.some((r) => r.token === row.token);
            if (exists) return prev.map((r) => (r.token === row.token ? row : r));
            return [row, ...prev];
        });
    }

    function makeFormData(args: { toEmail?: string; expiresAt?: string; maxViews?: string }) {
        const fd = new FormData();
        fd.set("docId", docId);
        fd.set("alias", alias);
        fd.set("toEmail", args.toEmail ?? "");
        fd.set("expiresAt", args.expiresAt ?? "");
        fd.set("maxViews", args.maxViews ?? "");
        return fd;
    }

    function buildRowFromCreateResult(res: { token: string } & Record<string, unknown>): ShareRow {
        // createAndEmailShareToken currently returns {ok, token, url}
        // so we synthesize a row for UI. (Stats will hydrate real counts.)
        return {
            token: String(res.token),
            to_email: null,
            created_at: new Date().toISOString(),
            expires_at: null,
            max_views: null,
            view_count: 0,
            revoked_at: null,
            last_viewed_at: null, // ✅ FIX
        };
    }

    async function onCreateToken() {
        setErr(null);
        setStats(null);

        startTransition(async () => {
            try {
                const fd = makeFormData({ toEmail: "", expiresAt: "", maxViews: "" });

                const res = await createAndEmailShareToken(fd);

                if (!res.ok) {
                    setErr(res.message || res.error || "Failed to create share token.");
                    return;
                }

                const newRow = buildRowFromCreateResult(res);
                upsertRow(newRow);
                setSelectedToken(newRow.token);
            } catch (e: unknown) {
                setErr(e instanceof Error ? e.message : "Unexpected error creating share token.");
            }
        });
    }

    async function onLoadStats(token: string) {
        setErr(null);
        startTransition(async () => {
            try {
                const res = await getShareStatsByToken(token);
                if (!res.ok) {
                    setErr(res.message || res.error || "Failed to load stats.");
                    setStats(null);
                    return;
                }
                setStats(res);
                upsertRow(res.row);
            } catch (e: unknown) {
                setErr(e instanceof Error ? e.message : "Unexpected error loading stats.");
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

                const nowIso = new Date().toISOString();

                setShares((prev) =>
                    prev.map((r) => (r.token === token ? { ...r, revoked_at: nowIso } : r))
                );

                setStats((prev) => {
                    if (!prev?.ok) return prev;
                    if (prev.row.token !== token) return prev;
                    return { ...prev, row: { ...prev.row, revoked_at: nowIso } };
                });
            } catch (e: unknown) {
                setErr(e instanceof Error ? e.message : "Unexpected error revoking token.");
            }
        });
    }

    return (
        <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Owner share controls</h2>
                    <p className="text-sm text-neutral-600">
                        {docTitle} · <span className="font-mono">/d/{alias}</span>
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onCreateToken}
                    disabled={busy || !docId}
                    className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    title={!docId ? "docId missing" : ""}
                >
                    {busy ? "Creating..." : "Create share token"}
                </button>
            </div>

            {err ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {err}
                </div>
            ) : null}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {/* LEFT: token list */}
                <div className="rounded-lg border border-neutral-200 p-3">
                    <h3 className="mb-2 text-sm font-semibold">Tokens</h3>

                    {shares.length === 0 ? (
                        <p className="text-sm text-neutral-600">No share tokens yet.</p>
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
                                        <div className="flex items-start justify-between gap-3">
                                            <button
                                                type="button"
                                                className="flex-1 text-left"
                                                onClick={() => {
                                                    setSelectedToken(r.token);
                                                    setStats(null);
                                                }}
                                            >
                                                <div className="font-mono text-xs break-all">{r.token}</div>
                                                <div className="mt-1 text-xs text-neutral-600">
                                                    created {fmtIso(r.created_at)} · views {r.view_count}
                                                    {r.max_views != null ? ` / ${r.max_views}` : ""}
                                                    {r.expires_at ? ` · expires ${fmtIso(r.expires_at)}` : ""}
                                                    {revoked ? ` · revoked ${fmtIso(r.revoked_at)}` : ""}
                                                    {r.last_viewed_at ? ` · last ${fmtIso(r.last_viewed_at)}` : ""}
                                                    {r.to_email ? ` · to ${r.to_email}` : ""}
                                                </div>
                                            </button>

                                            <div className="flex flex-col gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onLoadStats(r.token)}
                                                    disabled={busy}
                                                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
                                                >
                                                    Load stats
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => onRevoke(r.token)}
                                                    disabled={busy || revoked}
                                                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
                                                >
                                                    Revoke
                                                </button>
                                            </div>
                                        </div>

                                        {isSelected ? (
                                            <div className="mt-2 rounded-md bg-neutral-50 p-2 text-xs text-neutral-600">
                                                Share token selected.
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* RIGHT: selected token details */}
                <div className="rounded-lg border border-neutral-200 p-3">
                    <h3 className="mb-2 text-sm font-semibold">Selected token</h3>

                    {!selectedRow ? (
                        <p className="text-sm text-neutral-600">Select a token to review details.</p>
                    ) : (
                        <div className="space-y-2 text-sm">
                            <div className="font-mono text-xs break-all">{selectedRow.token}</div>

                            <div className="rounded-md border border-neutral-200 p-2">
                                <div>
                                    <span className="text-neutral-600">Created:</span>{" "}
                                    {fmtIso(selectedRow.created_at)}
                                </div>
                                <div>
                                    <span className="text-neutral-600">Views:</span> {selectedRow.view_count}
                                    {selectedRow.max_views != null ? ` / ${selectedRow.max_views}` : ""}
                                </div>
                                <div>
                                    <span className="text-neutral-600">Last viewed:</span>{" "}
                                    {selectedRow.last_viewed_at ? fmtIso(selectedRow.last_viewed_at) : "Never"}
                                </div>
                                <div>
                                    <span className="text-neutral-600">Expires:</span>{" "}
                                    {selectedRow.expires_at ? fmtIso(selectedRow.expires_at) : "No"}
                                </div>
                                <div>
                                    <span className="text-neutral-600">Revoked:</span>{" "}
                                    {selectedRow.revoked_at ? fmtIso(selectedRow.revoked_at) : "No"}
                                </div>
                            </div>

                            <div className="rounded-md border border-neutral-200 p-2">
                                <div className="mb-1 text-sm font-medium">Stats (server)</div>

                                {stats?.ok ? (
                                    <div className="space-y-1">
                                        <div>
                                            <span className="text-neutral-600">Views:</span>{" "}
                                            {stats.row.view_count}
                                        </div>
                                        <div>
                                            <span className="text-neutral-600">Last viewed:</span>{" "}
                                            {stats.row.last_viewed_at ? fmtIso(stats.row.last_viewed_at) : "Never"}
                                        </div>
                                        <div>
                                            <span className="text-neutral-600">Expires:</span>{" "}
                                            {stats.row.expires_at ? fmtIso(stats.row.expires_at) : "Not set"}
                                        </div>
                                        <div>
                                            <span className="text-neutral-600">Revoked:</span>{" "}
                                            {stats.row.revoked_at ? fmtIso(stats.row.revoked_at) : "No"}
                                        </div>
                                        <div>
                                            <span className="text-neutral-600">Max views:</span>{" "}
                                            {stats.row.max_views ?? "—"}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-neutral-600">
                                        Click <span className="font-medium">Load stats</span> on a token to fetch current server data.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
