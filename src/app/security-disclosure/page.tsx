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
            Effective date: February 27, 2026. Report security issues privately and responsibly.
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
            {" "}with reproduction steps, impact, and affected routes or flows.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Priority scope</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Auth/authz bypass, cross-tenant or cross-user access, and share resolution flaws.</li>
            <li>Encryption handling issues, key-version misuse, or plaintext serve paths.</li>
            <li>Upload validation bypasses and scan/quarantine bypasses.</li>
            <li>Rate-limit bypasses, brute-force paths, or token/alias abuse vectors.</li>
            <li>Billing entitlement bypasses and subscription state drift vulnerabilities.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Testing expectations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Do not exfiltrate, modify, or delete data you do not own.</li>
            <li>Do not perform denial-of-service or destructive testing in production.</li>
            <li>Keep details private until triage and remediation are complete.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Response targets</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Acknowledgment within 2 business days.</li>
            <li>Triage and severity assignment after validation.</li>
            <li>Status updates for critical findings through remediation.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
