"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type AccessIntent = "admin" | "viewer";

type AccessCard = {
  key: AccessIntent;
  label: string;
  title: string;
  description: string;
  secondary: string;
  cta: string;
};

type SignInClientProps = {
  googleConfigured: boolean;
  enterpriseConfigured: boolean;
  signupEnabled: boolean;
  authError: string | null;
  initialIntent: AccessIntent;
};

const ACCESS_CARDS: AccessCard[] = [
  {
    key: "admin",
    label: "For admins and owners",
    title: "Manage workspace",
    description:
      "Create protected links, manage files, control access, review activity, and handle workspace settings.",
    secondary: "Best for document owners, team members, billing, and policy controls.",
    cta: "Continue as admin / owner",
  },
  {
    key: "viewer",
    label: "For members and recipients",
    title: "Open shared content",
    description:
      "Access protected files, continue reviewing documents, and return to links shared with you.",
    secondary: "Best for recipients, guest access, and shared document viewing.",
    cta: "Continue as member",
  },
];

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Google sign-in is currently unavailable. Try again or use email sign-in.",
  OAuthCallback: "Sign-in callback failed. Please try again.",
  OAuthCreateAccount: "Unable to create an account from this provider. Use email sign-in or contact support.",
  Callback: "Authentication callback failed. Please try again.",
  AccessDenied: "Access was denied for this sign-in attempt.",
  Verification: "Verification failed. Please restart sign-in.",
  Configuration: "Authentication is not configured correctly. Contact support.",
  Default: "Unable to sign in right now. Please try again.",
};

function callbackForIntent(intent: AccessIntent) {
  return intent === "admin" ? "/auth/continue-admin" : "/auth/continue-viewer";
}

function mapAuthError(errorCode: string | null) {
  if (!errorCode) return null;
  return AUTH_ERROR_MESSAGES[errorCode] || AUTH_ERROR_MESSAGES.Default;
}

function AccessIcon({ intent }: { intent: AccessIntent }) {
  if (intent === "admin") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
        <path d="M12 3 20 7v4.7c0 4.3-2.7 7.2-8 9.3-5.3-2.1-8-5-8-9.3V7z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.2 12.3 11 14l3.8-3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M2.5 12s3.8-6 9.5-6 9.5 6 9.5 6-3.8 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.9" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function TrustChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs text-white/74">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/90" />
      {label}
    </span>
  );
}

export default function SignInClient(props: SignInClientProps) {
  const initialOwnerReveal = props.initialIntent === "admin";
  const [ownerRevealOpen, setOwnerRevealOpen] = useState(initialOwnerReveal);
  const [intent, setIntent] = useState<AccessIntent>(initialOwnerReveal ? "admin" : "viewer");
  const [isGoogleEnabled, setIsGoogleEnabled] = useState(props.googleConfigured);
  const [isEnterpriseEnabled, setIsEnterpriseEnabled] = useState(props.enterpriseConfigured);
  const [busyProvider, setBusyProvider] = useState<"google" | "enterprise-sso" | null>(null);

  const errorMessage = mapAuthError(props.authError);
  const callbackUrl = callbackForIntent(intent);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/providers", { cache: "no-store" });
        if (!res.ok) return;
        const providers = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        setIsGoogleEnabled(Boolean(providers?.google));
        setIsEnterpriseEnabled(Boolean(providers?.["enterprise-sso"]));
      } catch {
        // Keep server-derived defaults if provider discovery fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const intentTitle = intent === "admin" ? "Admin / Owner workspace access" : "Member / Recipient access";
  const intentSubtext =
    intent === "admin"
      ? "Sign in to run secure sharing operations and workspace controls."
      : "Sign in to open shared files and continue working in the member workspace.";
  const emailHref = `/signin/manual?intent=${intent}`;

  const onProviderSignIn = async (provider: "google" | "enterprise-sso") => {
    if (busyProvider) return;
    setBusyProvider(provider);
    try {
      await signIn(provider, { callbackUrl });
    } finally {
      setBusyProvider(null);
    }
  };

  const viewerCard = ACCESS_CARDS.find((card) => card.key === "viewer")!;
  const adminCard = ACCESS_CARDS.find((card) => card.key === "admin")!;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute right-[-9rem] top-[4rem] h-[25rem] w-[25rem] rounded-full bg-blue-400/12 blur-3xl" />
        <div className="absolute inset-x-0 top-[20rem] h-40 bg-gradient-to-b from-transparent via-cyan-200/[0.03] to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[1160px] space-y-6">
        <section className="glass-card-strong ui-sheen rounded-[30px] border-white/18 p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_minmax(0,0.8fr)] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/14 bg-white/[0.04] px-3 py-1.5 text-xs tracking-[0.14em] text-white/65 uppercase">
                <img src="/branding/cyang_primary.svg" alt="" className="h-4 w-4 opacity-85" />
                cyang.io / DocLinks
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Secure access,
                <span className="font-editorial ml-2 text-cyan-100">without the friction.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72 sm:text-base">
                Sign in to manage protected documents, access shared files, and continue where you left off.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <TrustChip label="Protected document access" />
                <TrustChip label="Role-based entry" />
                <TrustChip label="Secure authentication" />
              </div>
            </div>

            <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-white/48">Security posture</div>
              <div className="mt-3 space-y-3 text-sm text-white/72">
                <div className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
                  <span>Authentication routes are separated by access intent.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
                  <span>Workspace operations and recipient viewing are clearly isolated.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-300/90" />
                  <span>Policy controls, audit workflows, and secure document access stay protected.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card-strong rounded-[30px] border-white/18 p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.08fr_minmax(0,0.92fr)]">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-cyan-200/82">Choose how you&apos;re signing in</div>
              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={() => setIntent("viewer")}
                  className={[
                    "group w-full rounded-2xl border p-4 text-left transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-0",
                    intent === "viewer"
                      ? "border-cyan-300/35 bg-[linear-gradient(135deg,rgba(79,213,203,0.13),rgba(111,167,255,0.1))] shadow-[0_14px_36px_rgba(36,128,198,0.2)]"
                      : "border-white/12 bg-white/[0.03] hover:border-white/24 hover:bg-white/[0.06]",
                  ].join(" ")}
                  aria-pressed={intent === "viewer"}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                        intent === "viewer"
                          ? "border-cyan-300/25 bg-cyan-300/15 text-cyan-100"
                          : "border-white/14 bg-white/[0.05] text-white/74 group-hover:text-white",
                      ].join(" ")}
                    >
                      <AccessIcon intent="viewer" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[11px] uppercase tracking-[0.16em] text-white/50">{viewerCard.label}</span>
                      <span className="mt-1 block text-lg font-semibold text-white">{viewerCard.title}</span>
                      <span className="mt-1 block text-sm text-white/68">{viewerCard.description}</span>
                      <span className="mt-2 block text-xs text-white/50">{viewerCard.secondary}</span>
                      <span className="mt-3 inline-flex items-center rounded-lg border border-cyan-300/35 bg-cyan-300/14 px-3 py-1.5 text-xs font-medium text-cyan-100">
                        {viewerCard.cta}
                      </span>
                    </span>
                  </div>
                </button>

                <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
                  <button
                    type="button"
                    onClick={() =>
                      setOwnerRevealOpen((current) => {
                        const next = !current;
                        setIntent(next ? "admin" : "viewer");
                        return next;
                      })
                    }
                    className="group flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-sm text-white/82 transition hover:border-white/18 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    aria-expanded={ownerRevealOpen}
                  >
                    <span>
                      Workspace owner sign-in
                      <span className="mt-0.5 block text-xs text-white/55">Show admin tools for workspace management and policy controls.</span>
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" className={["h-4 w-4 text-white/65 transition-transform", ownerRevealOpen ? "rotate-180" : ""].join(" ")}>
                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {ownerRevealOpen ? (
                    <button
                      type="button"
                      onClick={() => setIntent("admin")}
                      className={[
                        "mt-3 group w-full rounded-xl border p-4 text-left transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-0",
                        intent === "admin"
                          ? "border-cyan-300/35 bg-[linear-gradient(135deg,rgba(79,213,203,0.13),rgba(111,167,255,0.1))] shadow-[0_14px_36px_rgba(36,128,198,0.2)]"
                          : "border-white/12 bg-white/[0.02] hover:border-white/22 hover:bg-white/[0.05]",
                      ].join(" ")}
                      aria-pressed={intent === "admin"}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={[
                            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                            intent === "admin"
                              ? "border-cyan-300/25 bg-cyan-300/15 text-cyan-100"
                              : "border-white/14 bg-white/[0.05] text-white/74 group-hover:text-white",
                          ].join(" ")}
                        >
                          <AccessIcon intent="admin" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-[11px] uppercase tracking-[0.16em] text-white/50">{adminCard.label}</span>
                          <span className="mt-1 block text-base font-semibold text-white">{adminCard.title}</span>
                          <span className="mt-1 block text-sm text-white/68">{adminCard.description}</span>
                          <span className="mt-2 block text-xs text-white/50">{adminCard.secondary}</span>
                          <span
                            className={[
                              "mt-3 inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium",
                              intent === "admin"
                                ? "border-cyan-300/35 bg-cyan-300/14 text-cyan-100"
                                : "border-white/14 bg-white/[0.05] text-white/74",
                            ].join(" ")}
                          >
                            {adminCard.cta}
                          </span>
                        </span>
                      </div>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-5 sm:p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-white/50">Authentication</div>
              <h2 className="mt-2 text-xl font-semibold text-white">{intentTitle}</h2>
              <p className="mt-2 text-sm text-white/66">{intentSubtext}</p>

              {errorMessage ? (
                <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => void onProviderSignIn("google")}
                  disabled={!isGoogleEnabled || busyProvider !== null}
                  className="btn-base block w-full rounded-xl border border-cyan-300/35 bg-cyan-300 px-4 py-3 text-left text-sm font-semibold text-[#07131f] shadow-[0_14px_34px_rgba(34,211,238,0.2)] hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/[0.08] disabled:text-white/55 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                >
                  {busyProvider === "google" ? "Continuing with Google..." : "Continue with Google"}
                </button>

                <button
                  type="button"
                  onClick={() => void onProviderSignIn("enterprise-sso")}
                  disabled={!isEnterpriseEnabled || busyProvider !== null}
                  className="btn-base block w-full rounded-xl border border-white/14 bg-white/[0.05] px-4 py-3 text-left text-sm text-white/86 hover:border-white/26 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:border-white/12 disabled:bg-white/[0.03] disabled:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                >
                  Continue with Enterprise SSO
                  {!isEnterpriseEnabled ? (
                    <span className="mt-1 block text-xs text-white/45">Available for organizations with SSO enabled.</span>
                  ) : null}
                </button>

                <Link
                  href={emailHref}
                  className="btn-base inline-flex rounded-xl border border-white/16 bg-white/[0.05] px-4 py-2.5 text-sm text-white/85 hover:border-white/25 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                >
                  Sign in with email
                </Link>
              </div>

              <div className="mt-6 rounded-xl border border-white/12 bg-black/20 p-4">
                <div className="text-sm font-medium text-white">New to DocLinks?</div>
                <p className="mt-1 text-sm text-white/62">
                  Create an account to share documents securely, manage protected links, and control member access.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {props.signupEnabled ? (
                    <Link href="/signup" className="btn-base btn-primary rounded-lg px-3.5 py-2 text-sm font-semibold">
                      Create account
                    </Link>
                  ) : null}
                  <Link href="/signin/manual?intent=viewer" className="btn-base btn-secondary rounded-lg px-3.5 py-2 text-sm">
                    Sign in with email
                  </Link>
                </div>
                <p className="mt-3 text-xs text-white/45">
                  Invited to view a file? Choose <span className="text-white/70">Open shared content</span> above.
                </p>
              </div>
            </div>
          </div>

          <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-white/50">
            <div>Need help signing in?</div>
            <div className="flex flex-wrap items-center gap-3">
              <a href="mailto:support@cyang.io" className="hover:text-white/80">
                Contact support
              </a>
              <Link href="/privacy" className="hover:text-white/80">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-white/80">
                Terms
              </Link>
              <a href="/status" className="hover:text-white/80">
                System status
              </a>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
