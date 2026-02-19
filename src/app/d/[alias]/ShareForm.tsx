// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useMemo, useState } from "react";
import { createAndEmailShareToken, getShareStatsByToken } from "./actions";

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function toIsoFromDatetimeLocal(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  // datetime-local: "YYYY-MM-DDTHH:mm"
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function ShareForm({ docId, alias }: { docId: string; alias?: string }) {
  const [toEmail, setToEmail] = useState("");
  const [expiresLocal, setExpiresLocal] = useState("");
  const [maxViews, setMaxViews] = useState<string>("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const shareUrl = useMemo(() => {
    if (!token) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/s/${token}`;
  }, [token]);

  async function onCreate() {
    setErr(null);
    setStats(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("alias", alias || "");
      fd.set("toEmail", toEmail.trim() ? toEmail.trim() : "");
      fd.set("expiresAt", toIsoFromDatetimeLocal(expiresLocal) ?? "");
      fd.set("maxViews", maxViews.trim());
      fd.set("password", password);

      const res: any = await createAndEmailShareToken(fd);
      if (!res.ok) {
        setErr(res.message || res.error || "Failed to create token.");
        return;
      }
      setToken(res.token);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  async function onStats() {
    if (!token) return;
    setErr(null);
    setBusy(true);
    try {
      const res: any = await getShareStatsByToken(token);
      if (!res.ok) {
        setErr(res.message || res.error || "Failed to load stats.");
        return;
      }
      setStats(res);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-300">
              Recipient email (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              If set, the viewer must enter the same email to unlock this link.
            </div>
            <input
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="recipient@example.com"
              inputMode="email"
              className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-300">
              Expires (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              Uses your local time.
            </div>
            <input
              type="datetime-local"
              value={expiresLocal}
              onChange={(e) => setExpiresLocal(e.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-300">
              Max views (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              Leave blank for unlimited. Use 0 for unlimited.
            </div>
            <input
              value={maxViews}
              onChange={(e) => setMaxViews(e.target.value)}
              placeholder="e.g. 3"
              inputMode="numeric"
              className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-300">
              Password (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              If set, viewer must enter password (and email if restricted).
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a password"
              className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCreate}
            disabled={busy || !docId}
            className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Create share link"}
          </button>

          <button
            onClick={onStats}
            disabled={busy || !token}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            Stats
          </button>
        </div>

        {err ? (
          <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        {shareUrl ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Share URL
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
              />
              <button
                type="button"
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                  } catch {}
                }}
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}

        {stats?.ok ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
            <div>
              <span className="text-neutral-500">Views:</span> {stats.view_count}
            </div>
            <div>
              <span className="text-neutral-500">Last viewed:</span>{" "}
              {fmtIso(stats.last_viewed_at ?? null)}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Expires: {fmtIso(stats.expires_at ?? null)} • Max views:{" "}
              {stats.max_views ?? "—"} • Recipient: {stats.to_email ?? "—"}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
