"use client";

import { useMemo } from "react";
import { signIn } from "next-auth/react";

function isConfigured() {
  // This runs client-side; we can't read server env vars.
  // We surface a "not configured" state via query param set by server errors,
  // and we also show setup guidance regardless.
  return true;
}

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { error?: string; callbackUrl?: string };
}) {
  const callbackUrl = searchParams?.callbackUrl || "/dashboard";
  const error = searchParams?.error;

  const help = useMemo(() => {
    if (!error) return null;

    // Common NextAuth errors:
    // - Configuration
    // - OAuthSignin / OAuthCallback / OAuthCreateAccount / OAuthAccountNotLinked
    // We keep message intentionally generic (security).
    return (
      <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
        <div className="font-medium">Sign-in failed</div>
        <div className="mt-1 text-xs text-red-200/80">
          {error === "Configuration"
            ? "SSO is not configured correctly."
            : "Your identity provider did not complete the sign-in flow."}
        </div>
      </div>
    );
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 backdrop-blur p-6 shadow-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">
          Enterprise SSO only. Your organization brings their own OpenID Connect (OIDC) provider.
        </p>

        {help}

        <div className="mt-6 space-y-3">
          <button
            className="w-full rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 transition px-4 py-3 text-left"
            onClick={() => signIn("enterprise-sso", { callbackUrl })}
          >
            <div className="font-medium">Continue with Enterprise SSO</div>
            <div className="text-xs text-white/60">OIDC (Okta, Entra ID, Auth0, Ping, etc.)</div>
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-medium">Admin setup</div>
          <p className="mt-2 text-xs text-white/70">
            To enable sign-in, set these environment variables in your deployment:
          </p>
          <ul className="mt-2 text-xs text-white/70 list-disc pl-5 space-y-1">
            <li><span className="font-mono">OIDC_ISSUER</span></li>
            <li><span className="font-mono">OIDC_CLIENT_ID</span></li>
            <li><span className="font-mono">OIDC_CLIENT_SECRET</span></li>
            <li className="pt-1">
              Recommended on Vercel: <span className="font-mono">AUTH_URL</span>,{" "}
              <span className="font-mono">AUTH_SECRET</span>,{" "}
              <span className="font-mono">AUTH_TRUST_HOST=true</span>
            </li>
          </ul>
        </div>

        <p className="mt-6 text-xs text-white/50">
          If your organization requires a specific redirect URL, use:{" "}
          <span className="font-mono">https://www.cyang.io/api/auth/callback/enterprise-sso</span>
        </p>
      </div>
    </div>
  );
}
