"use client";

import { useState } from "react";

type Props = {
  reportId: string;
  token: string | null;
  docId: string | null;
  currentStatus: string;
};

async function post(body: any) {
  const res = await fetch("/api/admin/abuse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || data?.message || "Request failed");
  }
  return data;
}

export default function AbuseActionsClient({ reportId, token, docId }: Props) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function run(action: any) {
    setBusy(true);
    setErr(null);
    try {
      await post({ ...action, reportId, reason: reason || null });
      // simplest refresh
      window.location.reload();
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-[260px]">
      <label htmlFor={`abuse-reason-${reportId}`} className="sr-only">
        Optional moderation reason
      </label>
      <input
        id={`abuse-reason-${reportId}`}
        aria-label="Moderation reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/20"
      />

      {err ? (
        <div className="mt-2 rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {err}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {docId ? (
          <>
            <button
              disabled={busy}
              onClick={() => run({ action: "disable_doc", docId })}
              className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-50"
            >
              Disable doc
            </button>
            <button
              disabled={busy}
              onClick={() => run({ action: "quarantine_doc", docId })}
              className="rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
            >
              Quarantine
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const confirm = window.prompt(`Type exactly: OVERRIDE ${docId}`);
                if (!confirm) return;
                run({ action: "override_quarantine", docId, ttlMinutes: 30, confirm });
              }}
              className="rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
            >
              Override 30m
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const confirm = window.prompt(`Type exactly: REVOKE_OVERRIDE ${docId}`);
                if (!confirm) return;
                run({ action: "revoke_override", docId, confirm });
              }}
              className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
            >
              Revoke override
            </button>
          </>
        ) : null}

        {token ? (
          <button
            disabled={busy}
            onClick={() => run({ action: "revoke_share", token })}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
          >
            Revoke share
          </button>
        ) : null}

        <button
          disabled={busy}
          onClick={() => run({ action: "close_report", reportId, notes: reason || null })}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
