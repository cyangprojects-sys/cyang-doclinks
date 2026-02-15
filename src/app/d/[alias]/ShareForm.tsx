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
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setMessage("Please enter an email.");
      return;
    }

    setBusy(true);

    try {
      const result = await shareDocToEmail({
        docId,
        email: trimmed,
        alias,
      });

      if (!result.ok) {
        setMessage(result.message || result.error || "Failed to send.");
      } else {
        setMessage("Sent successfully ✅");
        setEmail("");
      }
    } catch (err: any) {
      setMessage(err?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <label className="text-sm font-medium">
        Send this document via email
      </label>

      <div className="flex gap-2">
        <input
          type="email"
          placeholder="name@example.com"
          className="w-full rounded-md border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? "Sending..." : "Send"}
        </button>
      </div>

      {message && (
        <p className="text-sm opacity-80">
          {message}
        </p>
      )}
    </form>
  );
}
