"use client";

import { signIn } from "next-auth/react";

// Optional UI toggle: set NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED=true once configured.
const configured =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED === "true";

export default function SignInPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 backdrop-blur p-6 shadow-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>

        <p className="mt-2 text-sm text-white/70">
          Enterprise SSO uses your organization&apos;s identity provider (OIDC).
        </p>

        <div className="mt-6 space-y-3">
          <button
            className={[
              "w-full rounded-xl border border-white/10 px-4 py-3 text-left transition",
              configured ? "bg-white/10 hover:bg-white/15" : "bg-white/5 opacity-60 cursor-not-allowed",
            ].join(" ")}
            disabled={!configured}
            onClick={() => signIn("enterprise-sso", { callbackUrl: "/dashboard" })}
          >
            <div className="font-medium">Continue with Enterprise SSO</div>
            <div className="text-xs text-white/60">
              {configured
                ? "Use your organization account"
                : "Not configured yet — admin must provide OIDC issuer + client credentials"}
            </div>
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-medium">Admin setup</div>
          <p className="mt-1 text-xs text-white/70">
            Your identity provider must be configured to allow this callback URL:
          </p>
          <code className="mt-2 block text-xs text-white/80 break-all">
            https://www.cyang.io/api/auth/callback/enterprise-sso
          </code>

          <p className="mt-3 text-xs text-white/70">
            Configure env vars in Vercel:
          </p>
          <ul className="mt-2 text-xs text-white/70 list-disc pl-5 space-y-1">
            <li><code>NEXTAUTH_URL</code> = https://www.cyang.io</li>
            <li><code>NEXTAUTH_SECRET</code> = long random</li>
            <li><code>OIDC_ISSUER</code> (from IdP)</li>
            <li><code>OIDC_CLIENT_ID</code> (from IdP)</li>
            <li><code>OIDC_CLIENT_SECRET</code> (from IdP)</li>
            <li><code>NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED</code> = true (optional; enables button UI)</li>
          </ul>

          <p className="mt-3 text-xs text-white/70">
            If you don&apos;t have an issuer yet, leave the OIDC env vars unset. Keep the SSO button disabled
            until your customer provides their IdP details.
          </p>
        </div>
      </div>
    </div>
  );
}
