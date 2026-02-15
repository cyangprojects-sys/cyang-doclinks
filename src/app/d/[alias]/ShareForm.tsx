"use client";

import { useState } from "react";
import { shareDocToEmail } from "./actions";

type Props = {
  docId: string;
};

export default function ShareForm({ docId }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onSend() {
    setStatus(null);

    const cleaned = email.trim().toLowerCase();
    if (!cleaned) {
      setStatus("Enter an email.");
      return;
    }

    setBusy(true);
    try {
      const res = await shareDocToEmail({ docId, email: cleaned });
      if (!res.ok) setStatus(res.message ?? "Failed to send.");
      else setStatus(`Sent to ${cleaned} ✅`);
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Share via email</div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@domain.com"
          className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-600"
          inputMode="email"
          autoComplete="email"
        />
        <button
          onClick={onSend}
          disabled={busy}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>

      {status ? <div className="text-sm text-neutral-300">{status}</div> : null}
    </div>
  );
}
