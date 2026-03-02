import Link from "next/link";
import { activateManualSignup } from "@/lib/signup";

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
  let ok = false;

  if (token && email) {
    try {
      await activateManualSignup(email, token);
      ok = true;
      title = "Account activated";
      detail = "Your account is now active. You can sign in with email and password.";
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "INVALID_TOKEN";
      if (message.includes("TOKEN_EXPIRED")) {
        detail = "Your activation link has expired. Submit the sign-up form again to get a new link.";
      } else if (message.includes("SIGNUP_TABLES_MISSING")) {
        detail = "Signup tables are missing. Run scripts/sql/signup_activation.sql.";
      }
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="glass-card-strong rounded-2xl p-8">
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm text-white/70">{detail}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={ok ? "/signin/manual" : "/signup/manual"} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
            {ok ? "Continue to sign in" : "Back to sign up"}
          </Link>
          <Link href="/terms" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10">
            Terms of Service
          </Link>
        </div>
      </div>
    </main>
  );
}

