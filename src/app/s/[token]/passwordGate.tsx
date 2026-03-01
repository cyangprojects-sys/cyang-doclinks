"use client";

import { useMemo, useState } from "react";
import { verifySharePasswordResultAction } from "./actions";

export type PasswordGateProps = {
  token: string;
  hasPassword?: boolean;
  requireEmail?: boolean;
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
  const emailInputId = `share-email-${token}`;
  const passwordInputId = `share-password-${token}`;

  const title = useMemo(() => {
    if (hasPassword && requireEmail) return "Recipient verification required";
    if (hasPassword) return "Password verification required";
    if (requireEmail) return "Recipient email verification required";
    return "Continue";
  }, [hasPassword, requireEmail]);

  const buttonText = useMemo(() => {
        if (busy) return hasPassword ? "Verifying..." : "Continuing...";
    return hasPassword ? "Verify and continue" : "Continue";
  }, [busy, hasPassword]);

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5">
      <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/65">
        This document is access-controlled. Enter the required credentials to continue.
      </p>

      {requireEmail ? (
        <div className="mt-3 text-xs text-white/55">
          {emailHint ? (
            <>
              Use the recipient email this link was sent to (<span className="text-white/75">{emailHint}</span>).
            </>
          ) : (
            <>Use the recipient email this link was sent to.</>
          )}
        </div>
      ) : null}

      {err ? (
        <div role="alert" aria-live="assertive" className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {err}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {requireEmail ? (
          <div>
            <label htmlFor={emailInputId} className="mb-1.5 block text-xs text-white/65">
              Recipient email
            </label>
            <input
              id={emailInputId}
              type="email"
              aria-label="Recipient email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={emailHint ? `Email (${emailHint})` : "Recipient email"}
              className="w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none"
              autoComplete="email"
            />
          </div>
        ) : null}

        {hasPassword ? (
          <div>
            <label htmlFor={passwordInputId} className="mb-1.5 block text-xs text-white/65">
              Password
            </label>
            <input
              id={passwordInputId}
              type="password"
              aria-label="Password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-cyan-300/55 focus:outline-none"
              autoComplete="current-password"
            />
          </div>
        ) : null}

        <button
          disabled={busy}
          onClick={async () => {
            setErr(null);
            setBusy(true);
            try {
              const fd = new FormData();
              fd.set("token", token);
              fd.set("password", hasPassword ? pw : "");
              if (requireEmail) fd.set("email", email);

              const res = await verifySharePasswordResultAction(fd);
              if (!res.ok) {
                setErr(res.message);
                return;
              }

              window.location.href = `/s/${encodeURIComponent(token)}/view`;
            } finally {
              setBusy(false);
            }
          }}
          className="btn-base btn-primary w-full rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
