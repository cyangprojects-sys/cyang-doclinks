"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

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
    label: "Workspace control",
    title: "Manage protected sharing",
    description:
      "Create secure links, choose who gets access, set expiry windows, and review delivery activity.",
    secondary: "For owners, admins, team operations, billing, and document control.",
    cta: "Continue to workspace controls",
  },
  {
    key: "viewer",
    label: "Shared access",
    title: "Open protected documents",
    description:
      "Return to shared files, continue reviewing documents, and access the member experience cleanly.",
    secondary: "For members, recipients, and invited users opening shared content.",
    cta: "Continue to shared access",
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

export default function SignInClient(props: SignInClientProps) {
  const initialOwnerReveal = props.initialIntent === "admin";
  const [ownerRevealOpen, setOwnerRevealOpen] = useState(initialOwnerReveal);
  const [intent, setIntent] = useState<AccessIntent>(initialOwnerReveal ? "admin" : "viewer");
  const [busyProvider, setBusyProvider] = useState<"google" | "enterprise-sso" | null>(null);

  const isGoogleEnabled = props.googleConfigured;
  const isEnterpriseEnabled = props.enterpriseConfigured;
  const errorMessage = mapAuthError(props.authError);
  const callbackUrl = callbackForIntent(intent);

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
  const intentTitle = intent === "admin" ? "Workspace management access" : "Document viewing access";
  const intentSubtext =
    intent === "admin"
      ? "Sign in to manage secure sharing, access controls, member settings, and workspace operations."
      : "Sign in to continue reviewing shared files and open protected content with the correct access path.";
  const emailHref = `/signin/manual?intent=${intent}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background-primary)] px-4 py-10 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-9rem] h-[24rem] w-[24rem] rounded-full bg-[var(--accent-glow)] blur-3xl" />
        <div className="absolute right-[-7rem] top-[2rem] h-[22rem] w-[22rem] rounded-full bg-[rgba(93,137,223,0.08)] blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-[1180px] space-y-6">
        <section className="surface-panel-strong px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_340px] lg:items-end">
            <div>
              <div className="ui-badge inline-flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em]">
                <img src="/branding/cyang_primary.svg" alt="" className="h-4 w-4" />
                cyang.io / Doclinks
              </div>
              <h1 className="font-editorial mt-6 max-w-3xl text-balance text-4xl leading-[0.95] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                Secure access with clear control from the first click.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                Choose the access path that matches what you need to do. Workspace controls and document viewing stay
                separate by design, so protected sharing stays simple to operate.
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                {["Controlled access", "Timed sharing", "Secure authentication"].map((item) => (
                  <span key={item} className="ui-badge px-3 py-1.5 text-xs">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="surface-panel-soft px-5 py-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Why this flow is split</div>
              <div className="mt-4 space-y-4">
                {[
                  "Admin and owner access stays focused on sharing controls, expiry, and policy decisions.",
                  "Recipient access stays lighter and easier when the goal is simply to open a protected document.",
                  "The visual structure makes it obvious which path gives you control and which path gives you access.",
                ].map((item) => (
                  <div key={item} className="flex gap-3 text-sm leading-7 text-[var(--text-secondary)]">
                    <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent-primary)]/80" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="surface-panel-strong px-6 py-7 sm:px-8 sm:py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Choose access path</div>
              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={() => setIntent("viewer")}
                  className={[
                    "selection-tile w-full px-4 py-4 text-left",
                    intent === "viewer" ? "selection-tile-active" : "",
                  ].join(" ")}
                  aria-pressed={intent === "viewer"}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border text-[var(--text-secondary)]",
                        intent === "viewer"
                          ? "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)]"
                          : "border-[var(--border-subtle)] bg-white",
                      ].join(" ")}
                    >
                      <AccessIcon intent="viewer" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">{viewerCard.label}</span>
                      <span className="mt-1 block text-lg font-semibold text-slate-950">{viewerCard.title}</span>
                      <span className="mt-2 block text-sm leading-7 text-[var(--text-secondary)]">{viewerCard.description}</span>
                      <span className="mt-2 block text-xs text-[var(--text-muted)]">{viewerCard.secondary}</span>
                      <span className="mt-3 inline-flex border border-[var(--border-accent)] bg-[var(--surface-selected)] px-3 py-1.5 text-xs font-medium text-[var(--accent-primary)]">
                        {viewerCard.cta}
                      </span>
                    </span>
                  </div>
                </button>

                <div className="surface-panel-soft px-4 py-4">
                  <button
                    type="button"
                    onClick={() =>
                      setOwnerRevealOpen((current) => {
                        const next = !current;
                        setIntent(next ? "admin" : "viewer");
                        return next;
                      })
                    }
                    className="selection-tile flex w-full items-center justify-between px-3 py-3 text-left text-sm text-[var(--text-primary)]"
                    aria-expanded={ownerRevealOpen}
                  >
                    <span>
                      Workspace owner controls
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">
                        Show the admin path for link controls, team operations, and secure sharing policy.
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className={["h-4 w-4 text-[var(--text-muted)] transition-transform", ownerRevealOpen ? "rotate-180" : ""].join(" ")}
                    >
                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {ownerRevealOpen ? (
                    <button
                      type="button"
                      onClick={() => setIntent("admin")}
                      className={[
                        "selection-tile mt-3 w-full px-4 py-4 text-left",
                        intent === "admin" ? "selection-tile-active" : "",
                      ].join(" ")}
                      aria-pressed={intent === "admin"}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={[
                            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border text-[var(--text-secondary)]",
                            intent === "admin"
                              ? "border-[var(--border-accent)] bg-[var(--surface-selected)] text-[var(--accent-primary)]"
                              : "border-[var(--border-subtle)] bg-white",
                          ].join(" ")}
                        >
                          <AccessIcon intent="admin" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">{adminCard.label}</span>
                          <span className="mt-1 block text-base font-semibold text-slate-950">{adminCard.title}</span>
                          <span className="mt-2 block text-sm leading-7 text-[var(--text-secondary)]">{adminCard.description}</span>
                          <span className="mt-2 block text-xs text-[var(--text-muted)]">{adminCard.secondary}</span>
                          <span className="mt-3 inline-flex border border-[var(--border-accent)] bg-[var(--surface-selected)] px-3 py-1.5 text-xs font-medium text-[var(--accent-primary)]">
                            {adminCard.cta}
                          </span>
                        </span>
                      </div>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="surface-panel-soft px-5 py-5 sm:px-6">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Authentication</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{intentTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{intentSubtext}</p>

              {errorMessage ? (
                <div className="mt-4 border border-[rgba(186,71,50,0.22)] bg-[rgba(186,71,50,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => void onProviderSignIn("google")}
                  disabled={!isGoogleEnabled || busyProvider !== null}
                  className="btn-base btn-primary block w-full px-4 py-3 text-left text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyProvider === "google" ? "Continuing with Google..." : "Continue with Google"}
                </button>

                <button
                  type="button"
                  onClick={() => void onProviderSignIn("enterprise-sso")}
                  disabled={!isEnterpriseEnabled || busyProvider !== null}
                  className="btn-base btn-secondary block w-full px-4 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue with Enterprise SSO
                  {!isEnterpriseEnabled ? (
                    <span className="mt-1 block text-xs text-[var(--text-faint)]">
                      Available for organizations with SSO enabled.
                    </span>
                  ) : null}
                </button>

                <Link href={emailHref} className="btn-base btn-ghost inline-flex px-4 py-2.5 text-sm">
                  Sign in with email
                </Link>
              </div>

              <div className="mt-6 border border-[var(--border-subtle)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]">
                <div className="text-sm font-medium text-slate-950">New to Doclinks?</div>
                <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                  Create an account to share documents securely, control access duration, and manage who can open a file.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {props.signupEnabled ? (
                    <Link href="/signup" className="btn-base btn-primary px-3.5 py-2 text-sm font-semibold">
                      Create account
                    </Link>
                  ) : null}
                  <Link href="/signin/manual?intent=viewer" className="btn-base btn-secondary px-3.5 py-2 text-sm">
                    Sign in with email
                  </Link>
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Invited to view a file? Choose <span className="text-[var(--text-primary)]">Open protected documents</span> above.
                </p>
              </div>
            </div>
          </div>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-faint)]">
            <div>Need help signing in?</div>
            <div className="flex flex-wrap items-center gap-3">
              <a href="mailto:support@cyang.io" className="subtle-link">
                Contact support
              </a>
              <Link href="/trust" className="subtle-link">
                Trust Center
              </Link>
              <Link href="/privacy" className="subtle-link">
                Privacy
              </Link>
              <Link href="/terms" className="subtle-link">
                Terms
              </Link>
              <a href="/status" className="subtle-link">
                System status
              </a>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
