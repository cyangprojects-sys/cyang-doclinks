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
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-50"
        disabled={!!busy}
        onClick={() => act({ action: "set_status", noticeId, status: "reviewing" }, "reviewing")}
      >
        Mark reviewing
      </button>

      <button
        className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-50"
        disabled={!!busy}
        onClick={() => act({ action: "set_status", noticeId, status: "accepted" }, "accepted")}
      >
        Accept
      </button>

      <button
        className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-50"
        disabled={!!busy}
        onClick={() => act({ action: "set_status", noticeId, status: "rejected" }, "rejected")}
      >
        Reject
      </button>

      <button
        className="rounded-md bg-red-500/20 px-3 py-1.5 text-sm text-red-200 hover:bg-red-500/25 disabled:opacity-50"
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
        className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
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

      {msg ? <span className="text-xs text-white/60">{msg}</span> : null}
      <span className="text-xs text-white/40">Status: {status}</span>
    </div>
  );
}
