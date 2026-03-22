"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ResetPasswordClientProps = {
  email: string;
  token: string;
};

type Feedback =
  | { tone: "success"; message: string }
  | { tone: "error"; message: string }
  | null;

function isCompleteMode(email: string, token: string) {
  return Boolean(email && token);
}

export default function ResetPasswordClient({ email, token }: ResetPasswordClientProps) {
  const completeMode = isCompleteMode(email, token);
  const [requestEmail, setRequestEmail] = useState(email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const title = useMemo(() => (completeMode ? "Set a new password" : "Reset your password"), [completeMode]);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestEmail || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/manual-password-reset/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: requestEmail }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || payload.ok === false) {
        setFeedback({ tone: "error", message: payload.message || "Unable to start password reset right now." });
        return;
      }
      setFeedback({
        tone: "success",
        message: payload.message || "If the account is eligible for manual sign-in, a reset link will be sent.",
      });
    } catch {
      setFeedback({ tone: "error", message: "Unable to start password reset right now." });
    } finally {
      setBusy(false);
    }
  }

  async function submitComplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !token || !password || !confirmPassword || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/auth/manual-password-reset/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, token, password, confirmPassword }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || payload.ok === false) {
        const message =
          payload.error === "WEAK_PASSWORD"
            ? "Use at least 12 characters with uppercase, lowercase, number, and symbol."
            : payload.error === "INVALID_RESET_TOKEN"
            ? "This reset link is invalid or expired."
            : payload.message || "Unable to update password right now.";
        setFeedback({ tone: "error", message });
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setFeedback({
        tone: "success",
        message: payload.message || "Password updated. You can now sign in with the new password.",
      });
    } catch {
      setFeedback({ tone: "error", message: "Unable to update password right now." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto w-full max-w-[980px] px-4 py-12 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-12 top-2 h-64 w-64 rounded-full bg-[rgba(71,116,189,0.12)] blur-3xl" />
        <div className="absolute right-0 top-10 h-64 w-64 rounded-full bg-[rgba(152,167,188,0.16)] blur-3xl" />
      </div>

      <section className="surface-panel-strong p-7 sm:p-8">
        <span className="ui-badge inline-flex px-3 py-1 text-xs uppercase tracking-[0.16em]">
          Manual account access
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          {completeMode
            ? "Choose a new password for this activated manual account. Passwords are stored exactly as entered and must meet the shared account policy."
            : "Request a reset link for an activated manual account. The email path stays generic so account existence is not disclosed."}
        </p>

        {completeMode ? (
          <form onSubmit={submitComplete} className="mt-7 grid gap-4">
            <label className="block text-sm text-[var(--text-secondary)]">
              Account email
              <input type="email" value={email} disabled className="field-input mt-1.5 w-full px-3.5 py-2.5 text-sm opacity-75" />
            </label>

            <label className="block text-sm text-[var(--text-secondary)]">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="field-input mt-1.5 w-full px-3.5 py-2.5 text-sm"
                placeholder="Choose a strong password"
              />
            </label>

            <label className="block text-sm text-[var(--text-secondary)]">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                className="field-input mt-1.5 w-full px-3.5 py-2.5 text-sm"
                placeholder="Re-enter the new password"
              />
            </label>

            <div className="text-xs text-[var(--text-faint)]">
              At least 12 characters with uppercase, lowercase, number, and symbol. Unicode is supported. Control characters are rejected.
            </div>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={busy} className="btn-base btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                {busy ? "Updating..." : "Update password"}
              </button>
              <Link href="/signin/manual" className="btn-base btn-secondary px-5 py-2.5 text-sm">
                Back to manual sign in
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={submitRequest} className="mt-7 grid gap-4">
            <label className="block text-sm text-[var(--text-secondary)]">
              Account email
              <input
                type="email"
                autoComplete="email"
                value={requestEmail}
                onChange={(event) => setRequestEmail(event.target.value)}
                required
                className="field-input mt-1.5 w-full px-3.5 py-2.5 text-sm"
                placeholder="you@company.com"
              />
            </label>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={busy} className="btn-base btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
                {busy ? "Sending..." : "Send reset link"}
              </button>
              <Link href="/signin/manual" className="btn-base btn-secondary px-5 py-2.5 text-sm">
                Back to manual sign in
              </Link>
            </div>
          </form>
        )}

        {feedback ? (
          <div
            className={`mt-5 border px-3.5 py-2.5 text-sm ${
              feedback.tone === "success"
                ? "border-[rgba(40,136,88,0.18)] bg-[rgba(40,136,88,0.08)] text-[var(--success)]"
                : "border-[rgba(186,71,50,0.22)] bg-[rgba(186,71,50,0.08)] text-[var(--danger)]"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="mt-7 grid gap-2 text-xs text-[var(--text-faint)] sm:grid-cols-4">
          <Link href="/trust" className="subtle-link underline">Trust Center</Link>
          <Link href="/terms" className="subtle-link underline">Terms</Link>
          <Link href="/privacy" className="subtle-link underline">Privacy</Link>
          <Link href="/status" className="subtle-link underline">System status</Link>
        </div>
      </section>
    </main>
  );
}
