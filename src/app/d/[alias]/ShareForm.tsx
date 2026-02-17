"use client";

import { useMemo, useState } from "react";
import { createAndEmailShareToken, getShareStatsByToken } from "./actions";

function fmtIso(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ShareForm({ docId, alias }: { docId: string; alias: string }) {
  const [toEmail, setToEmail] = useState("");
  const [tokenLookup, setTokenLookup] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = useMemo(() => !!docId, [docId]);

  async function onCreate() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await createAndEmailShareToken(docId, {
        toEmail: toEmail.trim() ? toEmail.trim() : null,
        expiresAt: null,
        maxViews: null,
      });
      if (!res.ok) {
        setMsg(res.message || res.error);
        return;
      }
      setMsg(`Created. Copied link to clipboard.`);
      try {
        await navigator.clipboard.writeText(res.url);
      } catch { }
      setToEmail("");
    } finally {
      setBusy(false);
    }
  }

  async function onLookup() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await getShareStatsByToken(tokenLookup.trim());
      if (!res.ok) {
        setMsg(res.message || res.error);
        return;
      }
      setMsg(
        `Token ${res.token} · views ${res.view_count}${res.max_views != null ? `/${res.max_views}` : ""} · expires ${fmtIso(
          res.expires_at
        )} · revoked ${fmtIso(res.revoked_at)}`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="text-sm text-white/90">
        /d/{alias}
      </div>

      {!canCreate ? (
        <div className="mt-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm text-yellow-200">
          Share creation is disabled because docId was not provided.
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-white/60">Email a share link (optional)</label>
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="someone@domain.com"
          />
        </div>

        <div className="flex items-end">
          <button
            className="w-full rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-50"
            onClick={onCreate}
            disabled={busy || !canCreate}
          >
            Create
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className="block text-xs text-white/60">Lookup token stats</label>
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-white/20"
            value={tokenLookup}
            onChange={(e) => setTokenLookup(e.target.value)}
            placeholder="token"
          />
        </div>

        <div className="flex items-end">
          <button
            className="w-full rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-50"
            onClick={onLookup}
            disabled={busy || !tokenLookup.trim()}
          >
            Lookup
          </button>
        </div>
      </div>

      {msg ? <div className="mt-4 text-sm text-white/80">{msg}</div> : null}
    </div>
  );
}
