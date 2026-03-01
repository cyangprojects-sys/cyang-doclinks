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
  const [allowDownload, setAllowDownload] = useState(true);
  const [maxViews, setMaxViews] = useState<string>("");
  const [expiresLocal, setExpiresLocal] = useState<string>(""); // datetime-local

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
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
      fd.set("allowDownload", allowDownload ? "1" : "0");
      fd.set("expiresAt", toIsoFromDatetimeLocal(expiresLocal));
      fd.set("maxViews", maxViews.trim() ? maxViews.trim() : "");

      const res: any = await createAndEmailShareToken(fd);
      if (!res.ok) {
        setErr(res.message || res.error || "Failed to create token.");
        return;
      }
      setToken(res.token);
      const resolvedUrl =
        (typeof res.url === "string" && res.url.trim()) ||
        `${window.location.origin}/s/${encodeURIComponent(String(res.token || ""))}`;
      setShareUrl(resolvedUrl);
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

  async function onCopyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setErr("Unable to copy link. Copy manually from the field.");
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
            If set, access is restricted to this recipient email.
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
            If set, a password is required (in addition to recipient email, if enabled).
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a password"
            type="password"
            className="mt-2 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition"
          />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-cyan-400 focus:ring-cyan-500"
          />
            <span>
              <span className="font-medium text-neutral-200">Allow recipient download</span>
              <span className="mt-1 block text-xs text-neutral-500">
              If disabled, recipients can preview but cannot download.
              </span>
            </span>
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-300">
              Max Views (optional)
            </label>
            <div className="mt-1 text-xs text-neutral-500">
              Leave blank for no share-level cap. Use 1 for single-view delivery.
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
              When set, access stops at this exact time.
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
            {busy ? "Creating..." : "Create share link"}
          </button>

          <button
            onClick={onStats}
            disabled={busy || !token}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
          >
            Load stats
          </button>
        </div>

        {shareUrl ? (
          <div>
            <label className="text-sm font-medium text-neutral-300">Share link</label>
            <div className="mt-1 text-xs text-neutral-500">
              Created share URL for this document.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                readOnly
                value={shareUrl}
                className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
              />
              <button
                type="button"
                onClick={onCopyShareUrl}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                Copy link
              </button>
            </div>
          </div>
        ) : null}

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
