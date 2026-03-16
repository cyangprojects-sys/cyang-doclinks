import type { Metadata } from "next";
import Link from "next/link";
import { getSecurityEmail } from "@/lib/legal";
import { SiteShell } from "@/app/components/SiteShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security Disclosure - cyang.io",
  description:
    "Responsible vulnerability reporting process for cyang.io and Doclinks, including scope, testing rules, and response expectations.",
};

export default function SecurityDisclosurePage() {
  const securityEmail = getSecurityEmail();

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Trust and security
          </span>
          <h1 className="font-editorial mt-5 max-w-5xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Security disclosure policy
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            If you find a potential vulnerability, report it privately. We review security issues seriously and coordinate
            remediation with clear communication.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={`mailto:${securityEmail}`} className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Report to {securityEmail}
            </a>
            <Link href="/trust" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Trust Center
            </Link>
            <Link href="/status" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Status
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Response targets</div>
            <ul className="mt-4 space-y-2 text-sm text-white/72">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Acknowledgment within 2 business days.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Triage and severity assignment after validation.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Progress updates for high-impact findings.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20 grid gap-4 lg:grid-cols-12">
        <div className="glass-card rounded-3xl p-6 lg:col-span-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">How to report</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Include affected route or workflow, reproduction steps, expected behavior, actual behavior, and potential impact.
          </p>
        </div>
        <div className="glass-card rounded-3xl p-6 lg:col-span-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">Priority scope</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>Auth/authz bypass and cross-tenant exposure.</li>
            <li>Encryption and serve-path handling issues.</li>
            <li>Upload validation or scan-gating bypasses.</li>
            <li>Rate-limit or token abuse vectors.</li>
          </ul>
        </div>
        <div className="glass-card rounded-3xl p-6 lg:col-span-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">Testing expectations</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>Do not access or exfiltrate data you do not own.</li>
            <li>Do not perform destructive or denial-of-service testing.</li>
            <li>Keep report details private while remediation is in progress.</li>
          </ul>
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card rounded-3xl p-7 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Related trust resources
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink href="/legal/security-policy" label="Security Policy" />
            <QuickLink href="/legal" label="Legal Center" />
            <QuickLink href="/status" label="Status" />
            <QuickLink href="/report" label="Report abuse" />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link href={props.href} className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm text-white/86 transition-colors hover:bg-white/12">
      {props.label}
    </Link>
  );
}
