import Link from "next/link";
import { getSupportEmail } from "@/lib/legal";
import { SiteShell } from "@/app/components/SiteShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const supportEmail = getSupportEmail();

  return (
    <SiteShell maxWidth="full">
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Terms</h1>
          <div className="mt-2 text-sm text-white/60">Effective date: February 27, 2026.</div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">Service basis</h2>
          <p className="mt-2">
            cyang-doclinks is provided on an as-available basis. You are responsible for content you
            upload, share, and distribute through the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Security and enforcement model</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Encryption is enabled by default and plaintext serving is not permitted in production.</li>
            <li>Serving is blocked when scan status is failed, infected, or quarantined.</li>
            <li>Upload acceptance is allowlist-only with MIME and signature validation.</li>
            <li>Executable, script, macro-enabled, and other disallowed formats are rejected server-side.</li>
            <li>Rate limits and anti-abuse controls are enforced independently of client behavior.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Plan limits and billing</h2>
          <p className="mt-2">
            Storage, share, view, and file-size limits are enforced on the server. Paid entitlement
            state and downgrade handling are controlled by verified billing events.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Account and content actions</h2>
          <p className="mt-2">
            We may suspend links, quarantine content, disable tenants, or restrict access to protect
            users, enforce policy, or comply with legal requirements.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Policy references</h2>
          <p className="mt-2">
            By using this service, you agree to the{" "}
            <Link href="/acceptable-use" className="underline text-white/90 hover:text-white">
              Acceptable Use Policy
            </Link>
            ,{" "}
            <Link href="/privacy" className="underline text-white/90 hover:text-white">
              Privacy Policy
            </Link>
            ,{" "}
            <Link href="/data-retention" className="underline text-white/90 hover:text-white">
              Data Retention Disclosure
            </Link>
            , and{" "}
            <Link href="/dmca" className="underline text-white/90 hover:text-white">
              DMCA Policy
            </Link>
            .
          </p>
        </section>

        <p>
          Support and legal contact:{" "}
          <a className="underline text-white/90 hover:text-white" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      </div>
      </main>
    </SiteShell>
  );
}
