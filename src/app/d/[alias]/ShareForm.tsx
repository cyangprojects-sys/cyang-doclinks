"use client";

import { useState } from "react";
import { shareDocToEmail } from "./actions";

type Props = {
  docId: string;
  alias?: string;
};

export default function ShareForm({ docId, alias }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOk(null);
    setErr(null);

    const to = email.trim();
    if (!to) {
      setErr("Enter an email address.");
      return;
    }

    setBusy(true);
    try {
      const res = await shareDocToEmail({ docId, email: to, alias });
      if (!res?.ok) throw new Error("Send failed");
      setOk(`Sent to ${to}`);
      setEmail("");
    } catch (e: any) {
      setErr(e?.message || "Failed to send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="text-sm text-neutral-300">
        Email this link to someone.
        {alias ? (
          <span className="text-neutral-400"> (Will send /d/{alias})</span>
        ) : null}
      </div>

      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="name@example.com"
          className="w-full rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600"
        />
        <button
          disabled={busy}
          className="rounded bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>

      {ok ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {ok}
        </div>
      ) : null}

      {err ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {err}
        </div>
      ) : null}
    </form>
  );
}
