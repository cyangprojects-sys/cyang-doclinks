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

export default function ShareForm({ docId }: { docId: string }) {
  const [toEmail, setToEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const shareUrl = useMemo(() => {
    if (!token) return null;
    return `${typeof window !== "undefined" ? window.location.origin : ""}${window.location.pathname}?t=${token}`;
  }, [token]);

  async function onCreate() {
    setErr(null);
    setStats(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("toEmail", toEmail.trim() ? toEmail.trim() : "");
      fd.set("expiresAt", "");
      fd.set("maxViews", "");
      // fd.set("password", "");

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
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">
          Email (optional)
        </label>

        <input
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder="recipient@example.com"
          className="
        rounded-lg
        border border-neutral-700
        bg-neutral-800
        px-3 py-2
        text-sm
        text-neutral-100
        placeholder-neutral-500
        focus:outline-none
        focus:ring-2
        focus:ring-neutral-600
        focus:border-neutral-600
        transition
      "
        />

        <div className="flex gap-2">
          <button
            onClick={onCreate}
            disabled={busy || !docId}
            className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Working…" : "Create token"}
          </button>

          <button
            onClick={onStats}
            disabled={busy || !token}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
          >
            Stats
          </button>
        </div>

        {err ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {shareUrl ? (
          <div className="rounded-lg bg-neutral-50 p-3">
            <div className="text-xs text-neutral-600 mb-1">Share URL</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-xs"
              />
              <button
                type="button"
                className="rounded-md bg-black px-2 py-1 text-xs text-white"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                  } catch { }
                }}
              >
                Copy
              </button>
            </div>
          </div>
        ) : null}

        {stats?.ok ? (
          <div className="rounded-lg border border-neutral-200 p-3 text-sm">
            <div>
              <span className="text-neutral-600">Views:</span> {stats.view_count}
            </div>
            <div>
              <span className="text-neutral-600">Last viewed:</span>{" "}
              {fmtIso(stats.last_viewed_at ?? null)}
            </div>
            <div>
              <span className="text-neutral-600">Revoked:</span>{" "}
              {stats.revoked_at ? fmtIso(stats.revoked_at) : "No"}
            </div>
            <div>
              <span className="text-neutral-600">Expires:</span>{" "}
              {stats.expires_at ? fmtIso(stats.expires_at) : "No"}
            </div>
            <div>
              <span className="text-neutral-600">Max views:</span>{" "}
              {stats.max_views ?? "—"}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
