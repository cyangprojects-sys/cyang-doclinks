import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Privacy Policy</h1>
          <div className="mt-2 text-sm text-white/60">
            Effective date: February 26, 2026. This policy explains how doclinks data is collected and used.
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
            <li>Account identifiers (email, auth provider metadata).</li>
            <li>Uploaded document metadata (filename, size, type, timestamps).</li>
            <li>Access logs and security telemetry (hashed IP where configured, user agent, timestamps).</li>
            <li>Operational events (audit logs, key management actions, abuse/DMCA workflows).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">How we use data</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Provide secure document sharing and access control.</li>
            <li>Detect abuse, malware, and policy violations.</li>
            <li>Enforce plan limits and prevent service misuse.</li>
            <li>Maintain auditability for operational and compliance workflows.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Retention</h2>
          <p className="mt-2">
            We retain operational logs according to configured retention settings. Some immutable security/audit records
            may be retained longer for safety and compliance.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Security</h2>
          <p className="mt-2">
            Documents are encrypted by default. Access controls, rate limits, malware scanning, and audit trails are used
            to reduce risk, but no system is guaranteed to be perfectly secure.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Contact</h2>
          <p className="mt-2">
            For privacy requests, DMCA notices, or abuse reports use{" "}
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
