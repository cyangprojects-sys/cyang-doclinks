"use client";

import Link from "next/link";
import { useState } from "react";

type State = "idle" | "submitting" | "sent";

const signupEnabled =
  typeof process !== "undefined" &&
  String(process.env.NEXT_PUBLIC_SIGNUP_ENABLED || "").trim().toLowerCase() !== "false";

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

  if (!signupEnabled) {
    return (
      <main className="mx-auto w-full max-w-[1000px] px-4 py-12 sm:px-6">
        <div className="surface-panel-strong p-6 md:p-8">
          <h1 className="text-2xl font-semibold text-slate-950">Sign ups are temporarily paused</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Manual account registration is currently unavailable while maintenance is in progress.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/signin/manual" className="btn-base btn-secondary px-4 py-2 text-sm">
              Go to manual sign in
            </Link>
            <Link href="/signin" className="btn-base btn-secondary px-4 py-2 text-sm">
              Other sign-in options
            </Link>
            <Link href="/status" className="btn-base btn-secondary px-4 py-2 text-sm">
              View status
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (state === "sent") {
    return (
      <main className="mx-auto w-full max-w-[1000px] px-4 py-12 sm:px-6">
        <div className="surface-panel-strong p-6 md:p-8">
          <span className="ui-badge inline-flex px-3 py-1 text-xs uppercase tracking-[0.14em]">
            Account created
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">Check your email to activate your account</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            We created your pending account and sent an activation link. Your account becomes active after confirmation.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/signin/manual" className="btn-base btn-primary px-5 py-2.5 text-sm font-semibold">
              Continue to manual sign in
            </Link>
            <Link href="/signin" className="btn-base btn-secondary px-5 py-2.5 text-sm">
              Other sign-in options
            </Link>
            <Link href="/" className="btn-base btn-secondary px-5 py-2.5 text-sm">
              Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-[rgba(71,116,189,0.12)] blur-3xl" />
        <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-[rgba(152,167,188,0.16)] blur-3xl" />
      </div>

      <section className="surface-panel-strong p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_minmax(0,0.95fr)]">
          <div>
            <span className="ui-badge inline-flex px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Manual sign up
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Create your account with work email and password
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
              This route is ideal for teams that prefer manual credentials instead of Google or enterprise SSO.
              Setup takes a few minutes and includes email activation.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Fast setup</span>
              <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Trust references included</span>
              <span className="selection-pill px-3 py-1 text-xs text-[var(--text-secondary)]">Activation by email</span>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <InfoTile title="Who this is for" body="Teams and individuals who want explicit account setup with manual credentials." />
              <InfoTile title="What happens next" body="Activate your account, sign in, then start secure document delivery workflows." />
            </div>
          </div>

          <form
            className="surface-panel p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit(new FormData(event.currentTarget));
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name">
                <input name="firstName" required className={inputClassName} />
              </Field>
              <Field label="Last name">
                <input name="lastName" required className={inputClassName} />
              </Field>
              <Field label="Work email" spanAll>
                <input name="email" type="email" autoComplete="email" required className={inputClassName} />
              </Field>
              <Field label="Company">
                <input name="company" required className={inputClassName} />
              </Field>
              <Field label="Job title">
                <input name="jobTitle" className={inputClassName} />
              </Field>
              <Field label="Country/Region" spanAll>
                <input name="country" required className={inputClassName} />
              </Field>
              <Field label="Password">
                <input name="password" type="password" autoComplete="new-password" required className={inputClassName} />
              </Field>
              <Field label="Confirm password">
                <input name="confirmPassword" type="password" autoComplete="new-password" required className={inputClassName} />
              </Field>
            </div>

            <label className="mt-4 flex items-start gap-3 border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
              <input
                aria-label="I accept terms"
                name="acceptTerms"
                type="checkbox"
                required
                className="mt-0.5 h-4 w-4 border-[var(--border-subtle)] bg-white"
              />
              <span>
                I accept the <Link href="/terms" className="subtle-link underline">Terms of Service</Link> and{" "}
                <Link href="/privacy" className="subtle-link underline">Privacy Policy</Link>.
              </span>
            </label>

            {error ? (
              <div className="mt-3 border border-[rgba(186,71,50,0.22)] bg-[rgba(186,71,50,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="submit"
                disabled={state === "submitting"}
                className="btn-base btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {state === "submitting" ? "Creating account..." : "Create account"}
              </button>
              <Link href="/signup" className="btn-base btn-secondary px-5 py-2.5 text-sm">
                Back to signup options
              </Link>
              <Link href="/signin/manual" className="btn-base btn-secondary px-5 py-2.5 text-sm">
                Already have manual credentials?
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-6 grid gap-2 text-xs text-[var(--text-faint)] sm:grid-cols-4">
          <Link href="/trust" className="subtle-link underline">Trust Center</Link>
          <Link href="/legal/security-policy" className="subtle-link underline">Security Policy</Link>
          <Link href="/status" className="subtle-link underline">Status</Link>
          <Link href="/report" className="subtle-link underline">Report abuse</Link>
        </div>
      </section>
    </main>
  );
}

const inputClassName = "field-input mt-1.5 w-full px-3.5 py-2.5 text-sm";

function Field(props: { label: string; children: React.ReactNode; spanAll?: boolean }) {
  return (
    <label className={`text-sm text-[var(--text-secondary)] ${props.spanAll ? "md:col-span-2" : ""}`}>
      {props.label}
      {props.children}
    </label>
  );
}

function InfoTile(props: { title: string; body: string }) {
  return (
    <div className="surface-panel p-4">
      <div className="text-sm font-medium text-slate-950">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{props.body}</div>
    </div>
  );
}
