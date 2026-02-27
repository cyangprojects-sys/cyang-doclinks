import Link from "next/link";
import { getDmcaEmail, getPrivacyEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const privacyEmail = getPrivacyEmail();
  const dmcaEmail = getDmcaEmail();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Privacy Policy</h1>
          <div className="mt-2 text-sm text-white/60">
            Effective date: February 27, 2026. How cyang-doclinks handles account, document, and security data.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">Data we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account identifiers, login metadata, and tenant/org role context.</li>
            <li>Document metadata such as filename, size, type, encryption version, and timestamps.</li>
            <li>Share and access metadata such as alias/token outcomes, hashed IPs, and user-agent data.</li>
            <li>Security and billing events, including rate-limit, abuse, and subscription lifecycle logs.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">How data is used</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Operate secure upload, scan, and share workflows.</li>
            <li>Enforce authentication, authorization, anti-abuse, and quota controls.</li>
            <li>Investigate incidents and maintain immutable operational audit records.</li>
            <li>Support subscription and entitlement enforcement through verified billing events.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Security controls</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Encryption is on by default and plaintext serving is blocked in production.</li>
            <li>File acceptance uses explicit allowlists and rejects disallowed executable/script/macro classes.</li>
            <li>Public serving is blocked for failed, infected, or quarantined scan states.</li>
            <li>Rate limits and anomaly telemetry protect sensitive routes.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Retention and deletion</h2>
          <p className="mt-2">
            Retention windows differ by data class. Security and compliance records may be retained
            longer than high-volume analytics data. For details, see{" "}
            <Link href="/data-retention" className="underline text-white/90 hover:text-white">
              Data Retention Disclosure
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Contact</h2>
          <p className="mt-2">
            Privacy requests:{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${privacyEmail}`}>
              {privacyEmail}
            </a>
            . DMCA notices:{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${dmcaEmail}`}>
              {dmcaEmail}
            </a>
            . Abuse reports can also be submitted through{" "}
            <Link href="/report" className="underline text-white/90 hover:text-white">
              /report
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
