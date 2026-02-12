// src/app/admin/upload/AdminUploadClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type DocRow = {
    id: string;
    title: string;
    filename: string;
    content_type: string;
    bytes: string | number;
    created_at: string;
    alias?: string | null;
};

function formatBytes(n: number) {
    if (!Number.isFinite(n)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function cleanAlias(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

export default function AdminUploadClient() {
    const [title, setTitle] = useState("");
    const [alias, setAlias] = useState("");
    const [file, setFile] = useState<File | null>(null);

    const [docs, setDocs] = useState<DocRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Email modal state
    const [emailTo, setEmailTo] = useState("");
    const [emailSubject, setEmailSubject] = useState("Document link");
    const [emailMessage, setEmailMessage] = useState("Here’s the document link:");
    const [emailLink, setEmailLink] = useState("");
    const [showEmail, setShowEmail] = useState(false);

    const fileLabel = useMemo(() => {
        if (!file) return "Choose a PDF";
        return `${file.name} • ${formatBytes(file.size)}`;
    }, [file]);

    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/docs", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load documents");
            setDocs(json.docs || []);
        } catch (e: any) {
            setError(e?.message || "Failed to load documents");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
    }, []);

    async function onUpload() {
        setError(null);
        if (!title.trim()) return setError("Title is required.");
        if (!file) return setError("Choose a PDF.");
        if (file.type !== "application/pdf") return setError("Only PDFs are supported.");

        setBusy(true);
        try {
            const fd = new FormData();
            fd.set("title", title.trim());
            fd.set("file", file);

            const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Upload failed");

            // optional alias creation right after upload
            const docId = json.doc?.id as string | undefined;
            const a = cleanAlias(alias);

            setTitle("");
            setAlias("");
            setFile(null);

            await refresh();

            if (docId && a) {
                await createAlias(docId, a);
                await refresh();
            }
        } catch (e: any) {
            setError(e?.message || "Upload failed");
        } finally {
            setBusy(false);
        }
    }

    async function createAlias(docId: string, a: string) {
        const res = await fetch("/api/admin/alias", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ docId, alias: a }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Alias failed");
        return json as { ok: true; alias: string; link: string };
    }

    function magicLinkFor(doc: DocRow) {
        if (doc.alias) return `/d/${doc.alias}`;
        return `/d/${doc.id}`;
    }

    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore
        }
    }

    function openSendEmail(link: string) {
        setEmailLink(link);
        setShowEmail(true);
    }

    async function sendEmail() {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/send", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    to: emailTo.trim(),
                    subject: emailSubject.trim(),
                    message: emailMessage.trim(),
                    link: emailLink,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Send failed");
            setShowEmail(false);
            setEmailTo("");
        } catch (e: any) {
            setError(e?.message || "Send failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="min-h-[70vh] bg-black text-white">
            <div className="mx-auto max-w-6xl px-6 py-12">
                <div className="flex items-end justify-between gap-6">
                    <div>
                        <div className="text-xs text-white/60">Admin</div>
                        <h1 className="mt-1 text-3xl font-semibold">Uploads</h1>
                        <p className="mt-2 text-sm text-white/70">
                            Upload PDFs, create magic links, and email them out.
                        </p>
                    </div>
                    <button
                        onClick={refresh}
                        className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 ring-1 ring-white/10 hover:bg-white/15"
                        disabled={loading || busy}
                    >
                        Refresh
                    </button>
                </div>

                {error ? (
                    <div className="mt-6 rounded-2xl bg-red-500/10 p-4 ring-1 ring-red-500/30">
                        <div className="text-sm text-red-200">{error}</div>
                    </div>
                ) : null}

                {/* Upload box */}
                <div className="mt-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                    <div className="grid gap-4 md:grid-cols-12 md:items-end">
                        <div className="md:col-span-5">
                            <label className="text-xs text-white/60">Title</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Final Clearance Memo"
                                className="mt-2 w-full rounded-2xl bg-black/40 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-white/20"
                            />
                        </div>

                        <div className="md:col-span-4">
                            <label className="text-xs text-white/60">Alias (optional)</label>
                            <input
                                value={alias}
                                onChange={(e) => setAlias(e.target.value)}
                                placeholder="e.g. final-clearance-2026-02"
                                className="mt-2 w-full rounded-2xl bg-black/40 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-white/20"
                            />
                            <div className="mt-1 text-xs text-white/50">
                                Becomes <span className="text-white/70">/d/&lt;alias&gt;</span>
                            </div>
                        </div>

                        <div className="md:col-span-3">
                            <label className="text-xs text-white/60">PDF</label>
                            <div className="mt-2 flex items-center gap-3">
                                <label className="flex-1 cursor-pointer rounded-2xl bg-black/40 px-4 py-3 text-sm text-white/80 ring-1 ring-white/10 hover:bg-black/50">
                                    {fileLabel}
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    />
                                </label>

                                <button
                                    onClick={onUpload}
                                    disabled={busy}
                                    className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
                                >
                                    {busy ? "Working…" : "Upload"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Docs list */}
                <div className="mt-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Recent documents</h2>
                        <div className="text-xs text-white/60">
                            {loading ? "Loading…" : `${docs.length} shown`}
                        </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-xs text-white/60">
                                <tr className="border-b border-white/10">
                                    <th className="py-3 pr-4">Title</th>
                                    <th className="py-3 pr-4">File</th>
                                    <th className="py-3 pr-4">Alias</th>
                                    <th className="py-3 pr-4">Link</th>
                                    <th className="py-3 pr-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {docs.map((d) => {
                                    const link = magicLinkFor(d);
                                    const bytes = typeof d.bytes === "string" ? parseInt(d.bytes, 10) : d.bytes;
                                    return (
                                        <tr key={d.id} className="border-b border-white/5">
                                            <td className="py-4 pr-4">
                                                <div className="font-medium text-white/90">{d.title}</div>
                                                <div className="mt-1 text-xs text-white/50">
                                                    {new Date(d.created_at).toLocaleString()}
                                                </div>
                                            </td>
                                            <td className="py-4 pr-4 text-white/70">
                                                <div>{d.filename}</div>
                                                <div className="mt-1 text-xs text-white/50">
                                                    {formatBytes(bytes || 0)}
                                                </div>
                                            </td>
                                            <td className="py-4 pr-4 text-white/70">
                                                {d.alias ? (
                                                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-white/10">
                                                        {d.alias}
                                                    </span>
                                                ) : (
                                                    <AliasInline
                                                        docId={d.id}
                                                        onCreated={async () => {
                                                            await refresh();
                                                        }}
                                                    />
                                                )}
                                            </td>
                                            <td className="py-4 pr-4">
                                                <div className="rounded-xl bg-black/40 px-3 py-2 text-xs text-white/70 ring-1 ring-white/10">
                                                    {link}
                                                </div>
                                            </td>
                                            <td className="py-4 pr-0">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        onClick={() => copy(link)}
                                                        className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white ring-1 ring-white/10 hover:bg-white/15"
                                                    >
                                                        Copy
                                                    </button>
                                                    <a
                                                        href={link}
                                                        className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white ring-1 ring-white/10 hover:bg-white/15"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open
                                                    </a>
                                                    <button
                                                        onClick={() => openSendEmail(link)}
                                                        className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-black hover:bg-white/90"
                                                    >
                                                        Email
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {!loading && docs.length === 0 ? (
                                    <tr>
                                        <td className="py-8 text-white/60" colSpan={5}>
                                            No uploads yet. Upload a PDF above.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Email modal */}
                {showEmail ? (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
                        <div className="w-full max-w-xl rounded-3xl bg-zinc-950 p-6 ring-1 ring-white/10">
                            <div className="flex items-start justify-between gap-6">
                                <div>
                                    <div className="text-xs text-white/60">Send email</div>
                                    <div className="mt-1 text-lg font-semibold">Send magic link</div>
                                </div>
                                <button
                                    onClick={() => setShowEmail(false)}
                                    className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white ring-1 ring-white/10 hover:bg-white/15"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 grid gap-4">
                                <div>
                                    <label className="text-xs text-white/60">To</label>
                                    <input
                                        value={emailTo}
                                        onChange={(e) => setEmailTo(e.target.value)}
                                        placeholder="someone@example.com"
                                        className="mt-2 w-full rounded-2xl bg-black/40 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-white/20"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-white/60">Subject</label>
                                    <input
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        className="mt-2 w-full rounded-2xl bg-black/40 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-white/20"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-white/60">Message</label>
                                    <textarea
                                        value={emailMessage}
                                        onChange={(e) => setEmailMessage(e.target.value)}
                                        rows={4}
                                        className="mt-2 w-full rounded-2xl bg-black/40 px-4 py-3 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-white/20"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-white/60">Link</label>
                                    <div className="mt-2 rounded-2xl bg-black/40 px-4 py-3 text-sm text-white/80 ring-1 ring-white/10">
                                        {emailLink}
                                    </div>
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => setShowEmail(false)}
                                        className="rounded-2xl bg-white/10 px-5 py-3 text-sm text-white ring-1 ring-white/10 hover:bg-white/15"
                                        disabled={busy}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={sendEmail}
                                        className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
                                        disabled={busy}
                                    >
                                        {busy ? "Sending…" : "Send"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </main>
    );
}

function AliasInline(props: { docId: string; onCreated: () => void }) {
    const [alias, setAlias] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function save() {
        const a = cleanAlias(alias);
        if (!a) return setErr("Alias required");
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch("/api/admin/alias", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ docId: props.docId, alias: a }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) throw new Error(json.error || "Alias failed");
            props.onCreated();
        } catch (e: any) {
            setErr(e?.message || "Alias failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-w-[220px]">
            <div className="flex gap-2">
                <input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="set-alias"
                    className="w-full rounded-xl bg-black/40 px-3 py-2 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-white/20"
                />
                <button
                    onClick={save}
                    disabled={busy}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-60"
                >
                    {busy ? "…" : "Save"}
                </button>
            </div>
            {err ? <div className="mt-1 text-xs text-red-200/80">{err}</div> : null}
        </div>
    );
}
