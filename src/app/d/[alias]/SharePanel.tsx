// src/app/d/[alias]/SharePanel.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import ShareForm from "./ShareForm";
import {
    createAndEmailShareToken,
    getShareStatsByToken,
    revokeShareToken,
} from "./actions.server";

type ShareRow = {
    token: string;
    to_email: string | null;
    created_at: string;
    expires_at: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
};

function fmtIso(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

export default function SharePanel(props: {
    docId?: string;
    alias: string;

    // Optional niceties (page.tsx currently passes these)
    docTitle?: string;
    initialShares?: ShareRow[];
}) {
    const [pending, startTransition] = useTransition();

    const [shares, setShares] = useState<ShareRow[]>(props.initialShares ?? []);
    const [lookupToken, setLookupToken] = useState("");
    const [lookupResult, setLookupResult] = useState<null | {
        ok: boolean;
        error?: string;
        message?: string;
        created_at?: string;
        expires_at?: string | null;
        to_email?: string | null;
        max_views?: number | null;
        view_count?: number;
        revoked_at?: string | null;
        has_password?: boolean;
    }>(null);

    const title = props.docTitle || "Document";

    const canUseCreate = useMemo(() => {
        return !!props.docId && !pending;
    }, [props.docId, pending]);

    async function onRevoke(token: string) {
        startTransition(async () => {
            const res = await revokeShareToken(token);
            if (!res.ok) {
                setLookupResult(res);
                return;
            }
            // Optimistically mark revoked in local table
            setShares((prev) =>
                prev.map((r) => (r.token === token ? { ...r, revoked_at: new Date().toISOString() } : r))
            );
        });
    }

    async function onLookup() {
        const t = lookupToken.trim();
        if (!t) {
            setLookupResult({ ok: false, error: "missing_token", message: "Enter a token first." });
            return;
        }

        startTransition(async () => {
            const res = await getShareStatsByToken(t);
            setLookupResult(res);
        });
    }

    // Optional helper: quick-create token without emailing (kept here in case you use it elsewhere)
    async function quickCreateForMe() {
        if (!props.docId) return;

        startTransition(async () => {
            const res = await createAndEmailShareToken({
                doc_id: props.docId!,
                alias: props.alias,
            });

            if (!res.ok) {
                setLookupResult(res);
                return;
            }

            // Add row to the table (best-effort; page still loads initialShares from server)
            setShares((prev) => [
                {
                    token: res.token,
                    to_email: res.to_email ?? null,
                    created_at: new Date().toISOString(),
                    expires_at: res.expires_at ?? null,
                    max_views: res.max_views ?? null,
                    view_count: 0,
                    revoked_at: null,
                },
                ...prev,
            ]);

            setLookupToken(res.token);
            const st = await getShareStatsByToken(res.token);
            setLookupResult(st);
        });
    }

    return (
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-lg font-semibold">Owner share controls</div>
                    <div className="text-sm text-neutral-600">
                        {title} • <span className="font-mono">/d/{props.alias}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={!canUseCreate}
                        onClick={quickCreateForMe}
                        className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        title={props.docId ? "Create a token (no email)" : "docId not provided"}
                    >
                        {pending ? "Working…" : "Quick token"}
                    </button>
                </div>
            </div>

            <div className="mt-4">
                {props.docId ? (
                    <ShareForm docId={props.docId} alias={props.alias} />
                ) : (
                    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                        Share creation is disabled because <span className="font-mono">docId</span> was not provided to
                        <span className="font-mono"> SharePanel</span>. (Your page can pass it as{" "}
                        <span className="font-mono">doc.id</span>.)
                    </div>
                )}
            </div>

            <div className="mt-6 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                <div className="grid gap-1">
                    <label className="text-xs font-medium text-neutral-700">Lookup token stats</label>
                    <input
                        value={lookupToken}
                        onChange={(e) => setLookupToken(e.target.value)}
                        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                        placeholder="token"
                    />
                </div>
                <button
                    type="button"
                    onClick={onLookup}
                    disabled={pending}
                    className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                    {pending ? "Loading…" : "Lookup"}
                </button>
            </div>

            {lookupResult ? (
                <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                    {lookupResult.ok ? (
                        <div className="grid gap-1 md:grid-cols-2">
                            <div>
                                <span className="font-medium">Created:</span> {fmtIso(lookupResult.created_at ?? null)}
                            </div>
                            <div>
                                <span className="font-medium">To:</span> {lookupResult.to_email ?? "—"}
                            </div>
                            <div>
                                <span className="font-medium">Expires:</span> {fmtIso(lookupResult.expires_at ?? null)}
                            </div>
                            <div>
                                <span className="font-medium">Max views:</span> {lookupResult.max_views ?? "—"}
                            </div>
                            <div>
                                <span className="font-medium">Views:</span> {lookupResult.view_count ?? 0}
                            </div>
                            <div>
                                <span className="font-medium">Revoked:</span> {fmtIso(lookupResult.revoked_at ?? null)}
                            </div>
                            <div>
                                <span className="font-medium">Password:</span>{" "}
                                {lookupResult.has_password ? "Yes" : "No"}
                            </div>
                        </div>
                    ) : (
                        <div className="text-red-700">{lookupResult.message || lookupResult.error || "Error"}</div>
                    )}
                </div>
            ) : null}

            <div className="mt-6">
                <div className="text-sm font-semibold">Existing share tokens</div>

                {shares.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-600">No share tokens yet.</div>
                ) : (
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-neutral-200 text-left text-neutral-600">
                                    <th className="py-2 pr-3">Token</th>
                                    <th className="py-2 pr-3">To</th>
                                    <th className="py-2 pr-3">Created</th>
                                    <th className="py-2 pr-3">Expires</th>
                                    <th className="py-2 pr-3">Max</th>
                                    <th className="py-2 pr-3">Views</th>
                                    <th className="py-2 pr-3">Revoked</th>
                                    <th className="py-2 pr-0"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {shares.map((r) => {
                                    const revoked = !!r.revoked_at;
                                    return (
                                        <tr key={r.token} className="border-b border-neutral-100">
                                            <td className="py-2 pr-3 font-mono text-xs">{r.token}</td>
                                            <td className="py-2 pr-3">{r.to_email || "—"}</td>
                                            <td className="py-2 pr-3">{fmtIso(r.created_at)}</td>
                                            <td className="py-2 pr-3">{fmtIso(r.expires_at)}</td>
                                            <td className="py-2 pr-3">{r.max_views ?? "—"}</td>
                                            <td className="py-2 pr-3">{r.view_count}</td>
                                            <td className="py-2 pr-3">{fmtIso(r.revoked_at)}</td>
                                            <td className="py-2 pr-0 text-right">
                                                <button
                                                    type="button"
                                                    disabled={pending || revoked}
                                                    onClick={() => onRevoke(r.token)}
                                                    className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                                                >
                                                    {revoked ? "Revoked" : "Revoke"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
