// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useState } from "react";
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

function toIsoFromDatetimeLocal(v: string): string | "" {
  const s = (v || "").trim();
  if (!s) return "";
  // datetime-local returns "YYYY-MM-DDTHH:mm"
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

export default function ShareForm({ docId, alias }: { docId: string; alias?: string }) {
  const [shareTitle, setShareTitle] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [password, setPassword] = useState("");
  const [maxViews, setMaxViews] = useState<string>("");
  const [expiresLocal, setExpiresLocal] = useState<string>(""); // datetime-local

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  async function onCreate() {
    setErr(null);
    setStats(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("alias", alias || "");
      fd.set("shareTitle", shareTitle.trim() ? shareTitle.trim() : "");
      fd.set("toEmail", toEmail.trim() ? toEmail.trim() : "");
      fd.set("password", password); // may be blank
      fd.set("expiresAt", toIsoFromDatetimeLocal(expiresLocal));
      fd.set("maxViews", maxViews.trim() ? maxViews.trim() : "");

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
        <div>
          <label className="text-sm font-medium text-neutral-300">
            Title before sharing (optional)
          </label>
          <div className="mt-1 text-xs text-neutral-500">
            If set, updates this document title before creating the share link.
          </div>
          <input
            value={shareTitle}
            onChange={(e) => setShareTitle(e.target.value)}
            placeholder="Leave blank to keep current title"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-neutral-300">
            Recipient Email (optional)
          </label>
          <div className="mt-1 text-xs text-neutral-500">
            If set, the viewer must enter this email to unlock.
          </div>
          <input
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-neutral-300">
            Password (optional)
          </label>
          <div className="mt-1 text-xs text-neutral-500">
            If set, the viewer must enter this password (in addition to email, if required).
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a password"
            type="password"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-300">
              Max Views (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              Leave blank for unlimited. Use 1 for single-view.
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
              Expiration (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              When set, the link stops working after this time.
            </div>
            <input
              value={expiresLocal}
              onChange={(e) => setExpiresLocal(e.target.value)}
              type="datetime-local"
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
            {busy ? "Working…" : "Create + Email link"}
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

        {stats?.ok ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
              <div>
                <span className="text-neutral-500">Created:</span>{" "}
                {fmtIso(stats.row.created_at)}
              </div>
              <div>
                <span className="text-neutral-500">Expires:</span>{" "}
                {fmtIso(stats.row.expires_at)}
              </div>
              <div>
                <span className="text-neutral-500">Max Views:</span>{" "}
                {stats.row.max_views ?? "—"}
              </div>
              <div>
                <span className="text-neutral-500">Views:</span>{" "}
                {stats.row.view_count ?? stats.row.views_count ?? 0}
              </div>
              <div className="md:col-span-2">
                <span className="text-neutral-500">Recipient:</span>{" "}
                {stats.row.to_email || "—"}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
