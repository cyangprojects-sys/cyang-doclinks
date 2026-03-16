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
        <div className="absolute -left-12 top-0 h-64 w-64 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute right-0 top-8 h-64 w-64 rounded-full bg-teal-300/10 blur-3xl" />
      </div>

      <div className="glass-card-strong rounded-[30px] p-6 sm:p-8">
        <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
          Manual sign in
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Sign in with email and password
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
          Use manual credentials when Google or SSO is not your preferred path.
          Destination: {destinationLabel(intent)}.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/76">Secure authentication</span>
          <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/76">Role-aware destination</span>
          <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/76">Account activation required</span>
        </div>

        <form onSubmit={submit} className="mt-7 grid gap-4">
          <label className="block text-sm text-white/75">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors hover:border-white/25 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
              placeholder="you@company.com"
            />
          </label>

          <label className="block text-sm text-white/75">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors hover:border-white/25 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
              placeholder="Enter your password"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3.5 py-2.5 text-sm text-amber-100">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              disabled={busy}
              className="btn-base btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <Link href="/signin" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
              Back to sign-in options
            </Link>
            <Link href="/signup/manual" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
              Create manual account
            </Link>
          </div>
        </form>

        <div className="mt-7 grid gap-2 text-xs text-white/60 sm:grid-cols-4">
          <Link href="/trust" className="underline hover:text-white">Trust Center</Link>
          <Link href="/terms" className="underline hover:text-white">Terms</Link>
          <Link href="/privacy" className="underline hover:text-white">Privacy</Link>
          <Link href="/status" className="underline hover:text-white">System status</Link>
        </div>
      </div>
    </main>
  );
}
