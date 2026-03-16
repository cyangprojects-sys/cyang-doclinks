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
        <div className="glass-card-strong rounded-[28px] p-6 md:p-8">
          <h1 className="text-2xl font-semibold text-white">Sign ups are temporarily paused</h1>
          <p className="mt-2 text-sm text-white/70">
            Manual account registration is currently unavailable while maintenance is in progress.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/signin/manual" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
              Go to manual sign in
            </Link>
            <Link href="/signin" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
              Other sign-in options
            </Link>
            <Link href="/status" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
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
        <div className="glass-card-strong rounded-[28px] p-6 md:p-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.14em]">
            Account created
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">Check your email to activate your account</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            We created your pending account and sent an activation link. Your account becomes active after confirmation.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/signin/manual" className="btn-base btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold">
              Continue to manual sign in
            </Link>
            <Link href="/signin" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
              Other sign-in options
            </Link>
            <Link href="/" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
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
        <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
      </div>

      <section className="glass-card-strong rounded-[30px] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_minmax(0,0.95fr)]">
          <div>
            <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Manual sign up
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Create your account with work email and password
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">
              This route is ideal for teams that prefer manual credentials instead of Google or enterprise SSO.
              Setup takes a few minutes and includes email activation.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/76">Fast setup</span>
              <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/76">Trust references included</span>
              <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-xs text-white/76">Activation by email</span>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <InfoTile title="Who this is for" body="Teams and individuals who want explicit account setup with manual credentials." />
              <InfoTile title="What happens next" body="Activate your account, sign in, then start secure document delivery workflows." />
            </div>
          </div>

          <form
            className="rounded-2xl border border-white/14 bg-black/25 p-5 sm:p-6"
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

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white/85">
              <input
                aria-label="I accept terms"
                name="acceptTerms"
                type="checkbox"
                required
                className="mt-0.5 h-4 w-4 rounded border-white/30 bg-black/40"
              />
              <span>
                I accept the <Link href="/terms" className="text-cyan-200 underline">Terms of Service</Link> and{" "}
                <Link href="/privacy" className="text-cyan-200 underline">Privacy Policy</Link>.
              </span>
            </label>

            {error ? (
              <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="submit"
                disabled={state === "submitting"}
                className="btn-base btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {state === "submitting" ? "Creating account..." : "Create account"}
              </button>
              <Link href="/signup" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
                Back to signup options
              </Link>
              <Link href="/signin/manual" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
                Already have manual credentials?
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-6 grid gap-2 text-xs text-white/60 sm:grid-cols-4">
          <Link href="/trust" className="underline hover:text-white">Trust Center</Link>
          <Link href="/legal/security-policy" className="underline hover:text-white">Security Policy</Link>
          <Link href="/status" className="underline hover:text-white">Status</Link>
          <Link href="/report" className="underline hover:text-white">Report abuse</Link>
        </div>
      </section>
    </main>
  );
}

const inputClassName =
  "mt-1.5 w-full rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors hover:border-white/25 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20";

function Field(props: { label: string; children: React.ReactNode; spanAll?: boolean }) {
  return (
    <label className={`text-sm text-white/75 ${props.spanAll ? "md:col-span-2" : ""}`}>
      {props.label}
      {props.children}
    </label>
  );
}

function InfoTile(props: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 p-4">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/66">{props.body}</div>
    </div>
  );
}
