// src/app/s/[token]/passwordGate.tsx
"use client";

import { useMemo, useState } from "react";
import { verifySharePasswordResultAction } from "./actions";

export type PasswordGateProps = {
  token: string;
  /** If false, we still show a Continue-style button (no password field). */
  hasPassword?: boolean;
  /** If true, require email input (used for to_email restriction). */
  requireEmail?: boolean;
  /** Optional masked hint for the required email (e.g., c***@domain.com). */
  emailHint?: string | null;
};

export default function PasswordGate({
  token,
  hasPassword = true,
  requireEmail = false,
  emailHint = null,
}: PasswordGateProps) {
  const [pw, setPw] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => {
    if (hasPassword && requireEmail) return "This share requires email + password.";
    if (hasPassword) return "This share link is password protected.";
    if (requireEmail) return "This share requires the recipient email.";
    return "Continue to view.";
  }, [hasPassword, requireEmail]);

  const buttonText = useMemo(() => {
    if (busy) return hasPassword ? "Unlocking…" : "Continuing…";
    return hasPassword ? "Unlock" : "Continue";
  }, [busy, hasPassword]);

  return (
    <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-sm text-neutral-400">{title}</div>

      {requireEmail ? (
        <div className="mt-3 text-xs text-neutral-500">
          {emailHint ? (
            <>
              Enter the email this share was sent to (<span className="text-neutral-300">{emailHint}</span>).
            </>
          ) : (
            <>Enter the email this share was sent to.</>
          )}
        </div>
      ) : null}

      {err ? (
        <div className="mt-3 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {requireEmail ? (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={emailHint ? `Email (${emailHint})` : "Email"}
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
            autoComplete="email"
          />
        ) : null}

        {hasPassword ? (
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
            autoComplete="current-password"
          />
        ) : null}

        <button
          disabled={busy}
          onClick={async () => {
            setErr(null);
            setBusy(true);
            try {
              const fd = new FormData();
              fd.set("token", token);
              // Some servers expect "password" even if empty.
              fd.set("password", hasPassword ? pw : "");
              if (requireEmail) fd.set("email", email);

              const res = await verifySharePasswordResultAction(fd);
              if (!res.ok) {
                setErr(res.message);
                return;
              }

              // Success: client redirect to raw view
              window.location.href = `/s/${encodeURIComponent(token)}/raw`;
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
