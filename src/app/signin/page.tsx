"use client";

import Link from "next/link";

// UI toggles only (no secrets). These help the page display the right enabled/disabled state.
const googleConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

const enterpriseConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED === "true";
const signupEnabled =
  typeof process !== "undefined" && String(process.env.NEXT_PUBLIC_SIGNUP_ENABLED || "").trim().toLowerCase() !== "false";

export default function SignInPage() {
  const adminGoogleHref = "/api/auth/signin/google?callbackUrl=%2Fauth%2Fcontinue-admin";
  const adminEnterpriseHref = "/api/auth/signin/enterprise-sso?callbackUrl=%2Fauth%2Fcontinue-admin";
  const viewerGoogleHref = "/api/auth/signin/google?callbackUrl=%2Fauth%2Fcontinue-viewer";
  const viewerEnterpriseHref = "/api/auth/signin/enterprise-sso?callbackUrl=%2Fauth%2Fcontinue-viewer";

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-[1040px] rounded-2xl border border-white/10 bg-black/30 p-6 shadow-lg backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">Choose the surface you need before signing in.</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.06] p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-cyan-100/75">Admin / Owner</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Workspace operations</h2>
            <p className="mt-2 text-sm text-white/68">
              Use this if you manage documents, protected links, team access, billing, or workspace policy.
            </p>
            <div className="mt-4 space-y-3">
              {googleConfigured ? (
                <a href={adminGoogleHref} className="block w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-left transition hover:bg-white/15">
                  <div className="font-medium">Continue with Google</div>
                  <div className="text-xs text-white/60">Admin and owner accounts</div>
                </a>
              ) : (
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left opacity-60">
                  <div className="font-medium">Continue with Google</div>
                  <div className="text-xs text-white/60">Google sign-in not configured</div>
                </div>
              )}
              {enterpriseConfigured ? (
                <a href={adminEnterpriseHref} className="block w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-left transition hover:bg-white/15">
                  <div className="font-medium">Continue with Enterprise SSO</div>
                  <div className="text-xs text-white/60">Organization-managed admin access</div>
                </a>
              ) : (
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left opacity-60">
                  <div className="font-medium">Continue with Enterprise SSO</div>
                  <div className="text-xs text-white/60">Enterprise SSO not configured</div>
                </div>
              )}
              <Link href="/signin/manual?intent=admin" className="inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
                Sign in with email
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-white/12 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-white/58">Viewer / Recipient</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Product access</h2>
            <p className="mt-2 text-sm text-white/68">
              Use this if you are signing in as a viewer or recipient and do not need the admin workspace.
            </p>
            <div className="mt-4 space-y-3">
              {googleConfigured ? (
                <a href={viewerGoogleHref} className="block w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-left transition hover:bg-white/15">
                  <div className="font-medium">Continue with Google</div>
                  <div className="text-xs text-white/60">General and viewer access</div>
                </a>
              ) : (
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left opacity-60">
                  <div className="font-medium">Continue with Google</div>
                  <div className="text-xs text-white/60">Google sign-in not configured</div>
                </div>
              )}
              {enterpriseConfigured ? (
                <a href={viewerEnterpriseHref} className="block w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-left transition hover:bg-white/15">
                  <div className="font-medium">Continue with Enterprise SSO</div>
                  <div className="text-xs text-white/60">Organization-managed viewer access</div>
                </a>
              ) : (
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left opacity-60">
                  <div className="font-medium">Continue with Enterprise SSO</div>
                  <div className="text-xs text-white/60">Enterprise SSO not configured</div>
                </div>
              )}
              <Link href="/signin/manual?intent=viewer" className="inline-flex rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
                Sign in with email
              </Link>
            </div>
          </section>
        </div>

        <div className="mt-6 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="text-xs text-white/60">
            {signupEnabled ? "Need Account, sign up here" : "Sign up is temporarily disabled"}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {signupEnabled ? (
              <Link href="/signup" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
                Sign up
              </Link>
            ) : null}
            <Link href="/signin/manual" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
              Sign in with email
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-white/50">
          Admin and viewer access now use separate post-login routes so each account type lands in the correct surface.
        </p>
      </div>
    </div>
  );
}
