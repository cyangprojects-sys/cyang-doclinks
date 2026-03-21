"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

function destinationLabel(intent: "admin" | "viewer") {
  return intent === "admin" ? "Workspace management" : "Member and recipient access";
}

function callbackForIntent(intent: "admin" | "viewer") {
  return intent === "admin" ? "/auth/continue-admin" : "/auth/continue-viewer";
}

export default function ManualSignInClient({ intent }: { intent: "admin" | "viewer" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const callbackUrl = callbackForIntent(intent);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password || busy) return;

    setBusy(true);
    setError(null);

    const res = await signIn("manual-password", {
      email: email.trim(),
      password,
      redirect: false,
      callbackUrl,
    });

    if (!res || res.error) {
      setError("Sign-in failed. Check your credentials and confirm the account is activated.");
      setBusy(false);
      return;
    }

    window.location.href = res.url || callbackUrl;
  }

  return (
    <main className="relative mx-auto w-full max-w-[1040px] px-4 py-12 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-12 top-0 h-64 w-64 rounded-full bg-[rgba(71,116,189,0.12)] blur-3xl" />
        <div className="absolute right-0 top-8 h-64 w-64 rounded-full bg-[rgba(152,167,188,0.16)] blur-3xl" />
      </div>

      <div className="surface-panel-strong p-6 sm:p-8">
        <span className="ui-badge inline-flex px-3 py-1 text-xs uppercase tracking-[0.16em]">
          Manual sign in
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Sign in with email and password
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          Use manual credentials when Google or SSO is not your preferred path.
          Destination: {destinationLabel(intent)}.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Secure authentication</span>
          <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Role-aware destination</span>
          <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Account activation required</span>
        </div>

        <form onSubmit={submit} className="mt-7 grid gap-4">
          <label className="block text-sm text-[var(--text-secondary)]">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="field-input mt-1.5 w-full px-3.5 py-2.5 text-sm"
              placeholder="you@company.com"
            />
          </label>

          <label className="block text-sm text-[var(--text-secondary)]">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="field-input mt-1.5 w-full px-3.5 py-2.5 text-sm"
              placeholder="Enter your password"
            />
          </label>

          {error ? (
            <div className="border border-[rgba(186,71,50,0.22)] bg-[rgba(186,71,50,0.08)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              disabled={busy}
              className="btn-base btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <Link href="/signin" className="btn-base btn-secondary px-5 py-2.5 text-sm">
              Back to sign-in options
            </Link>
            <Link href="/signup/manual" className="btn-base btn-secondary px-5 py-2.5 text-sm">
              Create manual account
            </Link>
          </div>
        </form>

        <div className="mt-7 grid gap-2 text-xs text-[var(--text-faint)] sm:grid-cols-4">
          <Link href="/trust" className="subtle-link underline">Trust Center</Link>
          <Link href="/terms" className="subtle-link underline">Terms</Link>
          <Link href="/privacy" className="subtle-link underline">Privacy</Link>
          <Link href="/status" className="subtle-link underline">System status</Link>
        </div>
      </div>
    </main>
  );
}
