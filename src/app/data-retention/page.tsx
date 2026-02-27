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
            Effective date: February 27, 2026. Operational retention controls for doclinks.
          </div>
        </div>
        <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
          Home
        </Link>
      </div>

      <div className="mt-8 space-y-6 text-sm text-white/75">
        <section>
          <h2 className="text-base font-semibold text-white">Document and share lifecycle</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Free plan shares use fixed expiration windows and auto-delete policy defaults.</li>
            <li>Expired share tokens are revoked/cleaned by scheduled retention jobs.</li>
            <li>Deleted documents are removed from active serving paths immediately.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Operational logs</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>High-volume logs and analytics are retained according to configured retention windows.</li>
            <li>Nightly jobs aggregate and prune raw telemetry where applicable.</li>
            <li>Retention cleanup is automated and tracked in cron telemetry.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Audit records</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Security and administrative audit records are append-only by design.</li>
            <li>Some immutable records may be retained longer than operational analytics.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Backups and recovery</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Database and object-store recovery procedures are documented in internal runbooks.</li>
            <li>Retention cleanup is designed to avoid orphaned references and stale object drift.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white">Contact</h2>
          <p className="mt-2">
            For retention/privacy inquiries, contact{" "}
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
