"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function ManualSignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);

    const res = await signIn("manual-password", {
      email,
      password,
      redirect: false,
      callbackUrl: "/admin/dashboard",
    });

    if (!res || res.error) {
      setError("Invalid credentials or account not activated.");
      setBusy(false);
      return;
    }

    window.location.href = res.url || "/admin/dashboard";
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="glass-card-strong rounded-2xl p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-white">Sign in with email</h1>
        <p className="mt-2 text-sm text-white/70">
          Use email and password. Account must be activated from your email link first.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block text-sm text-white/75">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-sm text-white/75">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <Link href="/signup/manual" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10">
            Create manual account
          </Link>
        </div>
      </div>
    </main>
  );
}
