"use client";

import { useMemo, useState, useTransition } from "react";
import { createAndEmailShareToken, getShareStatsByToken, revokeShareToken } from "./actions";
import type { ShareRow } from "./actions";

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

export default function SharePanel({ docId, alias, docTitle, initialShares }: Props) {
    const [toEmail, setToEmail] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [maxViews, setMaxViews] = useState<string>("");
    const [busy, startTransition] = useTransition();
    const [shares, setShares] = useState<ShareRow[]>(initialShares || []);
    const [err, setErr] = useState<string | null>(null);

    const titleLine = useMemo(() => {
        const t = docTitle || "Document";
        return `${t} · /d/${alias}`;
    }, [docTitle, alias]);

    async function onQuickToken() {
        setErr(null);
        startTransition(async () => {
            const res = await createAndEmailShareToken(docId, {
                toEmail: null,
                expiresAt: null,
                maxViews: null,
            });

            if (!res.ok) {
                setErr(res.message || res.error);
                return;
            }

            // Optimistic add
            setShares((prev) => [
                {
                    token: res.token,
                    to_email: null,
                    created_at: new Date().toISOString(),
                    expires_at: null,
                    max_views: null,
                    view_count: 0,
                    revoked_at: null,
                },
                ...prev,
            ]);
            // Copy link
            try {
                await navigator.clipboard.writeText(res.url);
            } catch { }
        });
    }

    async function onCreateAndEmail() {
        setErr(null);
        const mv = maxViews.trim() === "" ? null : Number(maxViews);
        if (mv !== null && Number.isNaN(mv)) {
            setErr("Max views must be a number.");
            return;
        }

        startTransition(async () => {
            const res = await createAndEmailShareToken(docId, {
                toEmail: toEmail.trim() ? toEmail.trim() : null,
                expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
                maxViews: mv,
            });

            if (!res.ok) {
                setErr(res.message || res.error);
                return;
            }

            setShares((prev) => [
                {
                    token: res.token,
                    to_email: toEmail.trim() ? toEmail.trim() : null,
                    created_at: new Date().toISOString(),
                    expires_at: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
                    max_views: mv,
                    view_count: 0,
                    revoked_at: null,
                },
                ...prev,
            ]);

            setToEmail("");
            setExpiresAt("");
            setMaxViews("");

            try {
                await navigator.clipboard.writeText(res.url);
            } catch { }
        });
    }

    async function onLookup(token: string) {
        setErr(null);
        startTransition(async () => {
            const res = await getShareStatsByToken(token);
            if (!res.ok) {
                setErr(res.message || res.error);
                return;
            }
            alert(
                [
                    `Token: ${res.token}`,
                    `Alias: ${res.alias ?? "—"}`,
                    `To: ${res.to_email ?? "—"}`,
                    `Created: ${fmtIso(res.created_at)}`,
                    `Expires: ${fmtIso(res.expires_at)}`,
                    `Max views: ${res.max_views ?? "—"}`,
                    `Views: ${res.view_count}`,
                    `Revoked: ${fmtIso(res.revoked_at)}`,
                    `Last view: ${fmtIso(res.last_view_at)}`,
                ].join("\n")
            );
        });
    }

    async function onRevoke(token: string) {
        setErr(null);
        startTransition(async () => {
            const res = await revokeShareToken(token);
            if (!res.ok) {
                setErr(res.message || res.error);
                return;
            }
            setShares((prev) =>
                prev.map((s) => (s.token === token ? { ...s, revoked_at: new Date().toISOString() } : s))
            );
        });
    }

    return (
        <section className="mt-8 w-full max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-wide text-white/60">Owner share controls</div>
                    <div className="text-sm text-white/90">{titleLine}</div>
                </div>

                <button
                    className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
                    onClick={onQuickToken}
                    disabled={busy || !docId}
                    title="Creates a token and copies the link"
                >
                    Quick token
                </button>
            </div>

            {!docId ? (
                <div className="mt-4 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-200">
                    Share creation is disabled because docId was not provided to SharePanel. (Your page can pass it as doc.id.)
                </div>
            ) : null}

            {err ? (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    {err}
                </div>
            ) : null}

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                    <label className="block text-xs text-white/60">Recipient email (optional)</label>
                    <input
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                        value={toEmail}
                        onChange={(e) => setToEmail(e.target.value)}
                        placeholder="someone@domain.com"
                    />
                </div>

                <div className="md:col-span-1">
                    <label className="block text-xs text-white/60">Expires (optional)</label>
                    <input
                        type="datetime-local"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                    />
                </div>

                <div className="md:col-span-1">
                    <label className="block text-xs text-white/60">Max views (optional)</label>
                    <input
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
                        value={maxViews}
                        onChange={(e) => setMaxViews(e.target.value)}
                        placeholder="e.g. 5"
                    />
                </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
                <button
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
                    onClick={onCreateAndEmail}
                    disabled={busy || !docId}
                >
                    Create token (and email if provided)
                </button>

                <div className="text-xs text-white/50">
                    Copies the link to clipboard when created.
                </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-5">
                <div className="text-xs uppercase tracking-wide text-white/60">Existing share tokens</div>

                {shares.length === 0 ? (
                    <div className="mt-2 text-sm text-white/70">No share tokens yet.</div>
                ) : (
                    <div className="mt-3 space-y-2">
                        {shares.map((s) => (
                            <div
                                key={s.token}
                                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0">
                                    <div className="truncate font-mono text-xs text-white/80">{s.token}</div>
                                    <div className="mt-1 text-xs text-white/50">
                                        to: {s.to_email ?? "—"} · created: {fmtIso(s.created_at)} · expires:{" "}
                                        {fmtIso(s.expires_at)} · views: {s.view_count}
                                        {s.max_views != null ? ` / ${s.max_views}` : ""} · revoked:{" "}
                                        {fmtIso(s.revoked_at)}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
                                        onClick={() => onLookup(s.token)}
                                        disabled={busy}
                                    >
                                        Lookup
                                    </button>
                                    <button
                                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
                                        onClick={() => onRevoke(s.token)}
                                        disabled={busy || !!s.revoked_at}
                                        title={s.revoked_at ? "Already revoked" : "Revoke token"}
                                    >
                                        Revoke
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
