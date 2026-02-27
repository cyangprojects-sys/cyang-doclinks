import Link from "next/link";
import { getPrivacyEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DataRetentionPage() {
  const privacyEmail = getPrivacyEmail();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-white/60">cyang.io</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Data Retention Disclosure</h1>
          <div className="mt-2 text-sm text-white/60">
            Effective date: February 27, 2026. Lifecycle controls for cyang-doclinks documents and security data.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">Document lifecycle</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>New uploads are encrypted and written with key-version metadata.</li>
            <li>Share access is governed by expiry, revocation, quota, and scan status gates.</li>
            <li>Free plan links use fixed expiry behavior and 30-day auto-delete policy defaults.</li>
            <li>When a document is deleted, linked serving paths are disabled immediately.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Security and audit retention</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Audit logs are append-only for integrity and forensic review.</li>
            <li>Security telemetry, abuse events, and billing enforcement events are retained by policy window.</li>
            <li>Rate-limit and incident signals may be retained longer during active investigations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Cleanup and consistency jobs</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Scheduled jobs clean expired shares and aged data according to configured retention rules.</li>
            <li>Cleanup flows are designed to avoid orphaned storage objects and orphaned DB references.</li>
            <li>Operational telemetry tracks cron job success and failures for recovery visibility.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Backups and recovery</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Database and object-storage recovery procedures are documented for incident response.</li>
            <li>Recovery drills are tracked separately from routine backup runs.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Contact</h2>
          <p className="mt-2">
            For retention or privacy inquiries, contact{" "}
            <a className="underline text-white/90 hover:text-white" href={`mailto:${privacyEmail}`}>
              {privacyEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
