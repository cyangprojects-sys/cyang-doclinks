"use client";

import { useState } from "react";

type Props = {
  noticeId: string;
  docId: string | null;
  status: string;
};

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/dmca", {
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

export default function DmcaActionsClient({ noticeId, docId, status }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(action: Record<string, unknown>, label: string) {
    if (busy) return;
    setBusy(label);
    setMsg(null);
    try {
      await post(action);
      setMsg("Done. Refresh to see updates.");
    } catch {
      setMsg("Request failed. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={!!busy}
        onClick={() => act({ action: "set_status", noticeId, status: "reviewing" }, "reviewing")}
      >
        Mark reviewing
      </button>

      <button
        className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={!!busy}
        onClick={() => act({ action: "set_status", noticeId, status: "accepted" }, "accepted")}
      >
        Accept
      </button>

      <button
        className="btn-base btn-secondary rounded-sm px-3 py-1.5 text-sm disabled:opacity-50"
        disabled={!!busy}
        onClick={() => act({ action: "set_status", noticeId, status: "rejected" }, "rejected")}
      >
        Reject
      </button>

      <button
        className="btn-base rounded-sm border border-[rgba(186,71,50,0.2)] bg-[rgba(186,71,50,0.09)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[rgba(186,71,50,0.14)] disabled:opacity-50"
        disabled={!!busy || !docId}
        onClick={() => {
          if (!docId) return;
          const confirm = window.prompt(`Type exactly: TAKEDOWN ${docId}`);
          if (!confirm) return;
          act({ action: "takedown_doc", noticeId, docId, reason: "dmca:takedown", confirm }, "takedown");
        }}
      >
        Disable (takedown)
      </button>

      <button
        className="btn-base rounded-sm border border-[rgba(47,111,70,0.2)] bg-[rgba(47,111,70,0.09)] px-3 py-1.5 text-sm text-[var(--success)] hover:bg-[rgba(47,111,70,0.14)] disabled:opacity-50"
        disabled={!!busy || !docId}
        onClick={() => {
          if (!docId) return;
          const confirm = window.prompt(`Type exactly: RESTORE ${docId}`);
          if (!confirm) return;
          act({ action: "restore_doc", noticeId, docId, reason: "dmca:restored", confirm }, "restore");
        }}
      >
        Restore
      </button>

      {msg ? <span className="text-xs text-[var(--text-secondary)]">{msg}</span> : null}
      <span className="text-xs text-[var(--text-faint)]">Status: {status}</span>
    </div>
  );
}
