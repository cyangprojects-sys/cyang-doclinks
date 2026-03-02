"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

const googleConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

const enterpriseConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED === "true";

async function prepareSignupConsent(acceptTerms: boolean) {
  const resp = await fetch("/api/auth/signup-consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ acceptTerms }),
  });
  if (!resp.ok) throw new Error("Terms acceptance is required.");
}

export default function SignupPage() {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startProviderSignup(provider: "google" | "enterprise-sso") {
    if (!acceptTerms || busy) return;
    setBusy(true);
    setError(null);
    try {
      await prepareSignupConsent(true);
      await signIn(provider, { callbackUrl: "/admin/dashboard" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to start sign up.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="glass-card-strong rounded-2xl p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Sign up</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">Create your DocLinks account</h1>
        <p className="mt-2 text-sm text-white/70">
          Choose a signup method. New accounts must accept the Terms of Service before activation.
        </p>

        <label className="mt-6 flex items-start gap-3 rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white/85">
          <input
            aria-label="I accept the Terms of Service"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/30 bg-black/40"
          />
          <span>
            I accept the <Link href="/terms" className="text-cyan-200 underline">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="text-cyan-200 underline">Privacy Policy</Link>.
          </span>
        </label>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button
            disabled={!acceptTerms || !googleConfigured || busy}
            onClick={() => void startProviderSignup("google")}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-left text-sm text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="font-medium">Continue with Google</div>
            <div className="mt-1 text-xs text-white/60">
              {googleConfigured ? "Fast signup for individuals and small teams." : "Google signup is not configured."}
            </div>
          </button>

          <button
            disabled={!acceptTerms || !enterpriseConfigured || busy}
            onClick={() => void startProviderSignup("enterprise-sso")}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-left text-sm text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="font-medium">Continue with Enterprise SSO</div>
            <div className="mt-1 text-xs text-white/60">
              {enterpriseConfigured ? "Use your organization-managed identity provider." : "Enterprise SSO is not configured."}
            </div>
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4">
          <div className="text-sm font-medium text-white">Prefer manual entry?</div>
          <p className="mt-1 text-xs text-white/60">
            Fill out a full signup form with work details and activate via email verification.
          </p>
          <Link href="/signup/manual" className="mt-3 inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15">
            Manual sign up
          </Link>
        </div>

        <p className="mt-6 text-xs text-white/55">
          Already have an account? <Link href="/signin" className="text-cyan-200 underline">Sign in</Link>.
        </p>
        <div className="mt-3">
          <Link href="/" className="inline-flex rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
