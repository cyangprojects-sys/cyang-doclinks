"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";

// UI toggles only (no secrets). These help the page display the right enabled/disabled state.
const googleConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";

const enterpriseConfigured =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENTERPRISE_SSO_ENABLED === "true";

const AFTER_SIGN_IN = "/admin/dashboard";

export default function SignInPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 backdrop-blur p-6 shadow-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-white/70">Access your controlled delivery workspace.</p>

        <div className="mt-6 space-y-3">
          <button
            className={[
              "w-full rounded-xl border border-white/10 px-4 py-3 text-left transition",
              googleConfigured ? "bg-white/10 hover:bg-white/15" : "bg-white/5 opacity-60 cursor-not-allowed",
            ].join(" ")}
            disabled={!googleConfigured}
            onClick={() => signIn("google", { callbackUrl: AFTER_SIGN_IN })}
          >
            <div className="font-medium">Continue with Google</div>
            <div className="text-xs text-white/60">
              {googleConfigured ? "Small team and owner accounts" : "Google sign-in not configured"}
            </div>
          </button>

          <button
            className={[
              "w-full rounded-xl border border-white/10 px-4 py-3 text-left transition",
              enterpriseConfigured ? "bg-white/10 hover:bg-white/15" : "bg-white/5 opacity-60 cursor-not-allowed",
            ].join(" ")}
            disabled={!enterpriseConfigured}
            onClick={() => signIn("enterprise-sso", { callbackUrl: AFTER_SIGN_IN })}
          >
            <div className="font-medium">Continue with Enterprise SSO</div>
            <div className="text-xs text-white/60">
              {enterpriseConfigured ? "Organization-managed identity (OIDC)" : "Enterprise SSO not configured"}
            </div>
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="text-xs text-white/60">Need a new account?</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/signup" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
              Sign up
            </Link>
            <Link href="/signin/manual" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
              Sign in with email
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-white/50">
          Calm onboarding, enforced controls. If you do not see your sign-in method, contact your administrator.
        </p>
      </div>
    </div>
  );
}
