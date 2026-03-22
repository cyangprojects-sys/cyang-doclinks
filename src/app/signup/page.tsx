"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

const googleConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

const enterpriseConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED === "true";
const signupEnabled =
  typeof process !== "undefined" && String(process.env.NEXT_PUBLIC_SIGNUP_ENABLED || "").trim().toLowerCase() !== "false";

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

  if (!signupEnabled) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="surface-panel-strong p-6 md:p-8">
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--accent-primary)]">Sign up</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Sign ups are temporarily paused</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">New account creation is disabled while maintenance is in progress.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/signin" className="btn-base btn-primary px-4 py-2 text-sm">
              Sign in
            </Link>
            <Link href="/" className="btn-base btn-secondary px-4 py-2 text-sm">
              Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  async function startProviderSignup(provider: "google" | "enterprise-sso") {
    if (!acceptTerms || busy) return;
    setBusy(true);
    setError(null);
    try {
      await prepareSignupConsent(true);
      await signIn(provider, { callbackUrl: "/auth/continue-viewer" });
    } catch {
      setError("Unable to start sign up.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
      <div className="surface-panel-strong p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--accent-primary)]">Sign up</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Create your Doclinks account in under two minutes</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          For people who need to share sensitive documents without giving up control after send. New accounts accept
          Terms and Privacy during signup, then can start using protected links after activation.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Fast setup</span>
          <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Security-first defaults</span>
          <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Clear legal and trust references</span>
        </div>

        <label className="mt-6 flex items-start gap-3 border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
          <input
            aria-label="I accept the Terms of Service"
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 border-[var(--border-subtle)] bg-white"
          />
          <span>
            I accept the <Link href="/terms" className="subtle-link underline">Terms of Service</Link> and{" "}
            <Link href="/privacy" className="subtle-link underline">Privacy Policy</Link>.
          </span>
        </label>

        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button
            disabled={!acceptTerms || !googleConfigured || busy}
            onClick={() => void startProviderSignup("google")}
            className="selection-tile px-4 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="font-medium text-slate-950">Continue with Google</div>
            <div className="mt-1 text-xs text-[var(--text-faint)]">
              {googleConfigured ? "Fast signup for individuals and small teams." : "Google signup is not configured."}
            </div>
          </button>

          <button
            disabled={!acceptTerms || !enterpriseConfigured || busy}
            onClick={() => void startProviderSignup("enterprise-sso")}
            className="selection-tile px-4 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="font-medium text-slate-950">Continue with Enterprise SSO</div>
            <div className="mt-1 text-xs text-[var(--text-faint)]">
              {enterpriseConfigured ? "Use your organization-managed identity provider." : "Enterprise SSO is not configured."}
            </div>
          </button>
        </div>

        <div className="surface-panel mt-6 p-4">
          <div className="text-sm font-medium text-slate-950">Prefer manual signup?</div>
          <p className="mt-1 text-xs text-[var(--text-faint)]">
            Use full form entry with work details and activate by email verification.
          </p>
          <Link href="/signup/manual" className="btn-base btn-secondary mt-3 inline-flex px-3 py-2 text-sm">
            Manual sign up
          </Link>
        </div>

        <div className="surface-panel-soft mt-6 p-4">
          <div className="text-sm font-medium text-slate-950">What happens after signup?</div>
          <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
            <li>1. Confirm your account and sign in.</li>
            <li>2. Upload a document and choose the delivery controls.</li>
            <li>3. Share a protected link and keep visibility after send.</li>
          </ul>
        </div>

        <p className="mt-6 text-xs text-[var(--text-faint)]">
          Already have an account? <Link href="/signin" className="subtle-link underline">Sign in</Link>.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-faint)]">
          <Link href="/trust" className="subtle-link underline">Trust Center</Link>
          <Link href="/terms" className="subtle-link underline">Terms</Link>
          <Link href="/privacy" className="subtle-link underline">Privacy</Link>
          <Link href="/legal/security-policy" className="subtle-link underline">Security Policy</Link>
        </div>
        <div className="mt-3">
          <Link href="/" className="btn-base btn-ghost inline-flex px-3 py-2 text-xs">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
