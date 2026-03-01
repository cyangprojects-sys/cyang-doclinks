"use client";

import { useMemo, useState } from "react";

type Props = {
  token?: string | null;
  alias?: string | null;
};

export default function ReportForm({ token, alias }: Props) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const targetLabel = useMemo(() => {
    if (token) return `Share token: ${token.slice(0, 8)}…`;
    if (alias) return `Alias: ${alias}`;
    return "Unknown document";
  }, [token, alias]);

  async function submit() {
    setStatus("sending");
    setErr(null);
    try {
      const res = await fetch("/api/v1/abuse/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token || null,
          alias: alias || null,
          reporter_email: email || null,
          message: message || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setStatus("error");
        setErr(data?.message || data?.error || "Unable to submit report.");
        return;
      }
      setStatus("sent");
    } catch (e: any) {
      setStatus("error");
      setErr(e?.message || "Network error.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-white">Report submitted</div>
        <div className="mt-1 text-sm text-white/70">
          Thanks — we’ll review it. If this is an emergency, contact local authorities.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-medium text-white">Report abuse</div>
      <div className="mt-1 text-xs text-white/60">{targetLabel}</div>

      <label htmlFor="abuse-report-email" className="mt-4 block text-xs font-medium text-white/70">Your email (optional)</label>
      <input
        id="abuse-report-email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
        placeholder="you@example.com"
        type="email"
        autoComplete="email"
      />

      <label htmlFor="abuse-report-message" className="mt-4 block text-xs font-medium text-white/70">What’s going on?</label>
      <textarea
        id="abuse-report-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="mt-1 min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20"
        placeholder="Tell us why this content should be removed…"
      />

      {status === "error" && err ? (
        <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-white/50">
          By submitting, you agree to our{" "}
          <a className="text-white/70 underline hover:text-white" href="/acceptable-use">
            acceptable use policy
          </a>
          .
        </div>

        <button
          onClick={submit}
          disabled={status === "sending" || (!token && !alias) || (!message.trim() && !email.trim())}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
