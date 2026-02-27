import Link from "next/link";
import { getSecurityEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function SecurityDisclosurePage() {
  const securityEmail = getSecurityEmail();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Security Disclosure Policy</h1>
          <div className="mt-2 text-sm text-white/60">
            Effective date: February 27, 2026. Report security issues privately.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">How to report a vulnerability</h2>
          <p className="mt-2">
            Send reports to{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${securityEmail}`}>
              {securityEmail}
            </a>
            {" "}with clear reproduction steps, impact, and affected endpoints/routes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Scope</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Authentication, authorization, and access-control bypasses.</li>
            <li>Data exposure across tenants, users, or shares.</li>
            <li>Encryption/key handling weaknesses and unsafe fallback behavior.</li>
            <li>Rate-limit bypass or abuse paths that materially affect security.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Safe harbor expectations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Do not access or alter data you do not own beyond what is needed to demonstrate risk.</li>
            <li>Do not perform denial-of-service or destructive testing.</li>
            <li>Do not publish details before the issue is reviewed and fixed.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Response targets</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Initial triage acknowledgment within 2 business days.</li>
            <li>Severity classification and remediation plan after validation.</li>
            <li>Status updates for critical findings until resolved.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
