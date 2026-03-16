import type { Metadata } from "next";
import Link from "next/link";
import { getPrivacyEmail } from "@/lib/legal";
import { SiteShell } from "@/app/components/SiteShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Retention - cyang.io",
  description:
    "Data lifecycle and retention expectations for documents, security events, and operational records in cyang.io and Doclinks.",
};

export default function DataRetentionPage() {
  const privacyEmail = getPrivacyEmail();

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Privacy and operations
          </span>
          <h1 className="font-editorial mt-5 max-w-5xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Data retention policy
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            This page explains how cyang.io handles document lifecycle, security event retention, and cleanup behavior.
            The goal is predictable data handling with operational clarity.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/privacy" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Privacy Policy
            </Link>
            <Link href="/legal/data-processing-addendum" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Data Processing Addendum
            </Link>
            <a href={`mailto:${privacyEmail}`} className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Contact {privacyEmail}
            </a>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Retention posture</div>
            <ul className="mt-4 space-y-2 text-sm text-white/72">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Document lifecycle is policy-driven.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Security and audit events are retained for reviewability.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                <span>Cleanup jobs support consistency and recovery posture.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20 grid gap-4 md:grid-cols-2">
        <RetentionCard
          title="Document lifecycle"
          items={[
            "New uploads are encrypted and tracked with lifecycle metadata.",
            "Share access is governed by expiration, revocation, quota, and scan-state checks.",
            "When a document is deleted, linked serving paths are disabled immediately.",
          ]}
        />
        <RetentionCard
          title="Security and audit retention"
          items={[
            "Audit logs are append-only to preserve review integrity.",
            "Security telemetry and abuse events are retained by policy windows.",
            "Retention may extend for active incidents, legal obligations, or dispute handling.",
          ]}
        />
        <RetentionCard
          title="Cleanup and consistency jobs"
          items={[
            "Scheduled jobs remove expired shares and aged data based on active retention rules.",
            "Cleanup workflows are designed to avoid orphaned objects and references.",
            "Operational telemetry tracks cleanup reliability for follow-up when needed.",
          ]}
        />
        <RetentionCard
          title="Backups and recovery"
          items={[
            "Recovery procedures are documented for database and object storage workflows.",
            "Recovery drills are tracked separately from routine backup execution.",
            "Retention and recovery behavior are aligned to incident-response needs.",
          ]}
        />
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card rounded-3xl p-7 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Related trust resources</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <QuickLink href="/privacy" label="Privacy Policy" />
            <QuickLink href="/legal/data-processing-addendum" label="DPA" />
            <QuickLink href="/legal/subprocessors" label="Subprocessors" />
            <QuickLink href="/trust" label="Trust Center" />
            <QuickLink href="/contact" label="Contact" />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function RetentionCard(props: { title: string; items: string[] }) {
  return (
    <div className="glass-card rounded-3xl p-6">
      <h2 className="text-xl font-semibold tracking-tight text-white">{props.title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-white/70">
        {props.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link href={props.href} className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm text-white/86 transition-colors hover:bg-white/12">
      {props.label}
    </Link>
  );
}
