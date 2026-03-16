import Link from "next/link";
import { activateManualSignup, isSignupEnabled } from "@/lib/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SignupActivatePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) || {};
  const token = (Array.isArray(sp.token) ? sp.token[0] : sp.token) || "";
  const email = (Array.isArray(sp.email) ? sp.email[0] : sp.email) || "";

  let title = "Activation failed";
  let detail = "Your activation link is invalid or expired.";
  let tone: "success" | "error" = "error";
  let ok = false;

  if (!isSignupEnabled()) {
    detail = "Sign up is temporarily disabled.";
  } else if (token && email) {
    try {
      await activateManualSignup(email, token);
      ok = true;
      tone = "success";
      title = "Account activated";
      detail = "Your account is now active. Sign in to start secure document delivery.";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "INVALID_TOKEN";
      if (message.includes("TOKEN_EXPIRED")) {
        detail = "Your activation link has expired. Submit the sign-up form again to receive a new activation link.";
      } else {
        detail = "We could not activate this account from the current link. Request a new signup attempt.";
      }
    }
  }

  return (
    <main className="relative mx-auto w-full max-w-[980px] px-4 py-16 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-12 top-2 h-64 w-64 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute right-0 top-10 h-64 w-64 rounded-full bg-teal-300/10 blur-3xl" />
      </div>

      <section className="glass-card-strong rounded-[30px] p-7 sm:p-8">
        <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
          Account activation
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/70 sm:text-base">{detail}</p>

        <div
          className={`mt-5 rounded-xl border px-3.5 py-2.5 text-sm ${
            tone === "success"
              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/30 bg-amber-300/10 text-amber-100"
          }`}
        >
          {tone === "success"
            ? "Activation complete. You can continue directly to sign in."
            : "If this keeps happening, start a new signup request or contact support."}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href={ok ? "/signin/manual" : "/signup/manual"}
            className={ok ? "btn-base btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold" : "btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm"}
          >
            {ok ? "Continue to sign in" : "Back to manual sign up"}
          </Link>
          <Link href="/signin" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
            Sign-in options
          </Link>
          <Link href="/" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
            Home
          </Link>
        </div>

        <div className="mt-6 grid gap-2 text-xs text-white/60 sm:grid-cols-4">
          <Link href="/trust" className="underline hover:text-white">Trust Center</Link>
          <Link href="/terms" className="underline hover:text-white">Terms</Link>
          <Link href="/privacy" className="underline hover:text-white">Privacy</Link>
          <Link href="/status" className="underline hover:text-white">Status</Link>
        </div>
      </section>
    </main>
  );
}
