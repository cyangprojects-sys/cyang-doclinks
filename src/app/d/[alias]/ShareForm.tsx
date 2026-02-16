// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useMemo, useState } from "react";
import { createAndEmailShareToken, getShareStatsByToken } from "./actions.server";

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function ShareForm(props: { docId: string; alias: string }) {
  const [toEmail, setToEmail] = useState("");
  const [expiresInHours, setExpiresInHours] = useState<string>("");
  const [maxViews, setMaxViews] = useState<string>("");

  const [token, setToken] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "error"; message: string }
    | { kind: "ok"; message: string }
  >({ kind: "idle" });

  const [stats, setStats] = useState<null | {
    created_at: string;
    expires_at: string | null;
    to_email: string | null;
    max_views: number | null;
    view_count: number;
    revoked_at: string | null;
    has_password: boolean;
  }>(null);

  const canCreate = useMemo(() => {
    if (status.kind === "busy") return false;
    if (!props.docId) return false;
    return true;
  }, [status.kind, props.docId]);

  async function onCreate() {
    setStatus({ kind: "busy" });
    setShareUrl(null);
    setStats(null);

    const exp = expiresInHours.trim() ? Number(expiresInHours) : undefined;
    const mv = maxViews.trim() ? Number(maxViews) : undefined;

    const res = await createAndEmailShareToken({
      doc_id: props.docId,
      alias: props.alias,
      to_email: toEmail.trim() || undefined,
      expires_in_hours: Number.isFinite(exp as any) ? (exp as number) : undefined,
      max_views: Number.isFinite(mv as any) ? (mv as number) : undefined,
    });

    if (!res.ok) {
      setStatus({ kind: "error", message: res.message || res.error });
      return;
    }

    setToken(res.token);
    setShareUrl(res.share_url);
    setStatus({ kind: "ok", message: "Share token created." });

    // Fetch stats for immediate display
    const st = await getShareStatsByToken(res.token);
    if (st.ok) {
      setStats({
        created_at: st.created_at,
        expires_at: st.expires_at,
        to_email: st.to_email,
        max_views: st.max_views,
        view_count: st.view_count,
        revoked_at: st.revoked_at,
        has_password: st.has_password,
      });
    }
  }

  async function onLookup() {
    const t = token.trim();
    if (!t) {
      setStatus({ kind: "error", message: "Enter a token first." });
      return;
    }

    setStatus({ kind: "busy" });
    setStats(null);

    const st = await getShareStatsByToken(t);
    if (!st.ok) {
      setStatus({ kind: "error", message: st.message || st.error });
      return;
    }

    setStats({
      created_at: st.created_at,
      expires_at: st.expires_at,
      to_email: st.to_email,
      max_views: st.max_views,
      view_count: st.view_count,
      revoked_at: st.revoked_at,
      has_password: st.has_password,
    });

    setStatus({ kind: "ok", message: "Loaded stats." });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-semibold">Create share token</div>
      <div className="mt-1 text-sm text-neutral-600">
        Generates a /s/&lt;token&gt; link (optional email, expiration, view limit).
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
            {status.kind === "busy" ? "Working…" : "Create token"}
          </button>

          {status.kind === "error" ? (
            <div className="text-sm text-red-600">{status.message}</div>
          ) : status.kind === "ok" ? (
            <div className="text-sm text-green-700">{status.message}</div>
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-neutral-700">Token</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              placeholder="uuid token"
            />
          </div>
          <button
            disabled={status.kind === "busy"}
            onClick={onLookup}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Lookup stats
          </button>
        </div>

        {shareUrl ? (
          <div className="text-sm text-neutral-700">
            Share URL:{" "}
            <a className="underline" href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </div>
        ) : null}

        {stats ? (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <div className="grid gap-1 md:grid-cols-2">
              <div>
                <span className="font-medium">Created:</span> {fmtIso(stats.created_at)}
              </div>
              <div>
                <span className="font-medium">To:</span> {stats.to_email || "—"}
              </div>
              <div>
                <span className="font-medium">Expires:</span> {fmtIso(stats.expires_at)}
              </div>
              <div>
                <span className="font-medium">Max views:</span> {stats.max_views ?? "—"}
              </div>
              <div>
                <span className="font-medium">Views:</span> {stats.view_count}
              </div>
              <div>
                <span className="font-medium">Revoked:</span> {fmtIso(stats.revoked_at)}
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
