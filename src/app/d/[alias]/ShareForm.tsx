// src/app/d/[alias]/ShareForm.tsx
"use client";

import { useMemo, useState } from "react";
import { createAndEmailShareToken, getShareStatsByToken } from "./actions";

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

type Props = {
  docId: string;
  alias: string;
};

export default function ShareForm({ docId, alias }: Props) {
  const [toEmail, setToEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local value
  const [maxViews, setMaxViews] = useState(""); // number as string
  const [busy, setBusy] = useState(false);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultToken, setResultToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lookupToken, setLookupToken] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState<
    | null
    | {
      token: string;
      to_email: string | null;
      created_at: string;
      expires_at: string | null;
      max_views: number | null;
      view_count: number;
      revoked_at: string | null;
    }
  >(null);

  const canCreate = useMemo(() => {
    return Boolean(docId);
  }, [docId]);

  async function onCreate() {
    setError(null);
    setResultUrl(null);
    setResultToken(null);

    if (!docId) {
      setError("Missing docId.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("alias", alias || "");

      const email = toEmail.trim();
      if (email) fd.set("toEmail", email);

      // expiresAt: convert datetime-local -> ISO if provided
      const exp = expiresAt.trim();
      if (exp) {
        // datetime-local is in local time; Date() will interpret it as local
        const d = new Date(exp);
        if (!Number.isNaN(d.getTime())) {
          fd.set("expiresAt", d.toISOString());
        }
      }

      const mv = maxViews.trim();
      if (mv) {
        const n = Number(mv);
        if (Number.isFinite(n) && n >= 0) fd.set("maxViews", String(Math.floor(n)));
      }

      const res = await createAndEmailShareToken(fd);

      if (!res.ok) {
        setError(res.message || res.error || "Failed to create share token.");
        return;
      }

      setResultToken(res.token);
      setResultUrl(res.url);
    } catch (e: any) {
      setError(e?.message || "Failed to create token.");
    } finally {
      setBusy(false);
    }
  }

  async function onLookup() {
    setError(null);
    setLookup(null);

    const t = lookupToken.trim();
    if (!t) return;

    setLookupBusy(true);
    try {
      const res = await getShareStatsByToken(t);
      if (!res.ok) {
        setError(res.message || res.error || "Token not found.");
        return;
      }
      setLookup(res.row);
    } catch (e: any) {
      setError(e?.message || "Lookup failed.");
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!canCreate ? (
        <div className="rounded-md border border-yellow-300/40 bg-yellow-200/10 p-3 text-sm text-yellow-100">
          Share creation is disabled because <code>docId</code> was not provided.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <label className="block text-xs text-white/70">Email (optional)</label>
          <input
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="someone@domain.com"
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
          />
        </div>

        <div className="md:col-span-1">
          <label className="block text-xs text-white/70">Expires at (optional)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
          />
        </div>

        <div className="md:col-span-1">
          <label className="block text-xs text-white/70">Max views (optional)</label>
          <input
            inputMode="numeric"
            value={maxViews}
            onChange={(e) => setMaxViews(e.target.value)}
            placeholder="e.g. 10"
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onCreate}
          disabled={!canCreate || busy}
          className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Creating..." : "Create share token"}
        </button>

        {resultUrl ? (
          <a
            href={resultUrl}
            className="text-sm text-white/80 underline hover:text-white"
            target="_blank"
            rel="noreferrer"
          >
            Open share link
          </a>
        ) : null}

        {resultToken ? (
          <span className="text-xs text-white/60">
            token: <code className="text-white/80">{resultToken}</code>
          </span>
        ) : null}
      </div>

      <div className="pt-2">
        <div className="text-sm text-white/80">Lookup token stats</div>
        <div className="mt-2 flex gap-2">
          <input
            value={lookupToken}
            onChange={(e) => setLookupToken(e.target.value)}
            placeholder="token"
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
          />
          <button
            onClick={onLookup}
            disabled={lookupBusy}
            className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {lookupBusy ? "..." : "Lookup"}
          </button>
        </div>

        {lookup ? (
          <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
            <div>
              <b>Token:</b> <code>{lookup.token}</code>
            </div>
            <div>
              <b>To:</b> {lookup.to_email || "—"}
            </div>
            <div>
              <b>Created:</b> {fmtIso(lookup.created_at)}
            </div>
            <div>
              <b>Expires:</b> {fmtIso(lookup.expires_at)}
            </div>
            <div>
              <b>Max views:</b> {lookup.max_views ?? "—"}
            </div>
            <div>
              <b>Views:</b> {lookup.view_count}
            </div>
            <div>
              <b>Revoked:</b> {fmtIso(lookup.revoked_at)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
