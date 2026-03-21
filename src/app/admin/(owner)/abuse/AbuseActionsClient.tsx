"use client";

import { useState } from "react";

type Props = {
  reportId: string;
  token: string | null;
  docId: string | null;
  currentStatus: string;
};

async function post(body: Record<string, unknown>) {
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

  async function run(action: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await post({ ...action, reportId, reason: reason || null });
      // simplest refresh
      window.location.reload();
    } catch {
      setErr("Request failed. Please retry.");
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
        className="field-input w-full rounded-sm px-3 py-2 text-xs"
      />

      {err ? (
        <div className="mt-2 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {docId ? (
          <>
            <button
              disabled={busy}
              onClick={() => run({ action: "disable_doc", docId })}
              className="btn-base btn-primary rounded-sm px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Disable doc
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const confirm = window.prompt(`Type exactly: OVERRIDE ${docId}`);
                if (!confirm) return;
                run({ action: "override_quarantine", docId, ttlMinutes: 30, confirm });
              }}
              className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
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
              className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Revoke override
            </button>
          </>
        ) : null}

        {token ? (
          <button
            disabled={busy}
            onClick={() => run({ action: "revoke_share", token })}
            className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-xs disabled:opacity-50"
          >
            Revoke share
          </button>
        ) : null}

        <button
          disabled={busy}
          onClick={() => run({ action: "close_report", reportId, notes: reason || null })}
          className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
