"use client";

import Link from "next/link";
import { useState } from "react";

type State = "idle" | "submitting" | "sent";

export default function ManualSignupPage() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setState("submitting");
    setError(null);

    const payload = {
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      confirmPassword: String(formData.get("confirmPassword") || ""),
      company: String(formData.get("company") || ""),
      jobTitle: String(formData.get("jobTitle") || ""),
      country: String(formData.get("country") || ""),
      acceptTerms: String(formData.get("acceptTerms") || "") === "on",
    };

    const resp = await fetch("/api/auth/manual-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await resp.json().catch(() => ({}))) as { message?: string };
    if (!resp.ok) {
      setError(data.message || "Unable to complete sign up.");
      setState("idle");
      return;
    }

    setState("sent");
  }

  if (state === "sent") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="glass-card-strong rounded-2xl p-6 md:p-8">
          <h1 className="text-2xl font-semibold text-white">Check your email</h1>
          <p className="mt-2 text-sm text-white/70">
            We created your pending account and sent an activation link. Your account stays inactive until you click it.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/signin/manual" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
              Go to manual sign in
            </Link>
            <Link href="/signin" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10">
              Other sign in options
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="glass-card-strong rounded-2xl p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Manual sign up</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">Create account with email and password</h1>
        <p className="mt-2 text-sm text-white/70">
          Standard business signup fields with activation email verification.
        </p>

        <form
          className="mt-6 grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(new FormData(e.currentTarget));
          }}
        >
          <label className="text-sm text-white/75">
            First name
            <input name="firstName" required className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-sm text-white/75">
            Last name
            <input name="lastName" required className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-sm text-white/75 md:col-span-2">
            Work email
            <input name="email" type="email" autoComplete="email" required className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-sm text-white/75">
            Company
            <input name="company" required className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-sm text-white/75">
            Job title
            <input name="jobTitle" className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-sm text-white/75 md:col-span-2">
            Country/Region
            <input name="country" required className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" />
          </label>
          <label className="text-sm text-white/75">
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-sm text-white/75">
            Confirm password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white/85">
            <input aria-label="I accept terms" name="acceptTerms" type="checkbox" required className="mt-0.5 h-4 w-4 rounded border-white/30 bg-black/40" />
            <span>
              I accept the <Link href="/terms" className="text-cyan-200 underline">Terms of Service</Link> and{" "}
              <Link href="/privacy" className="text-cyan-200 underline">Privacy Policy</Link>.
            </span>
          </label>

          {error ? <p className="md:col-span-2 text-sm text-red-300">{error}</p> : null}

          <div className="md:col-span-2 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={state === "submitting"}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-60"
            >
              {state === "submitting" ? "Creating account..." : "Create account"}
            </button>
            <Link href="/signup" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10">
              Back to signup options
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

