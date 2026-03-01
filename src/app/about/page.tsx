import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export const metadata: Metadata = {
  title: "About - cyang.io",
  description:
    "About Chang Yang and cyang.io: practical tools with secure defaults, enforced policy gates, and audit-ready operations.",
};

export default function AboutPage() {
  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="absolute -bottom-36 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        </div>

        <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          About
        </p>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
          About
          <span className="block text-white/70">How I build and what I optimize for.</span>
        </h1>

        <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/70">
          cyang.io is a small product portfolio built around secure document operations. The
          direction is simple: enforce controls in code, keep policy deterministic, and make
          operations reviewable through immutable logs.
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/65">
          Doclinks was built after seeing sensitive and private documents distributed without
          enforced safeguards. Security should not depend on perfect user behavior. It should be
          part of the system design.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <Card
              title="How I build"
              desc="Principles that guide every production build:"
              items={[
                "Server-side enforcement over client trust",
                "Encryption enabled by default and not optional",
                "Scan and quarantine gates before public delivery",
                "Clear limits, clear states, clear audit trail",
              ]}
            />
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="text-sm font-medium text-white/90">Current focus</div>
              <div className="mt-3 space-y-3">
                <FocusRow
                  title="Doclinks"
                  desc="Short-link sharing with immutable audit logging and strict serve-time checks."
                />
                <FocusRow
                  title="Upload hardening"
                  desc="Extension + MIME + file-signature allowlist with executable and macro blocking."
                />
                <FocusRow
                  title="Operations"
                  desc="Cron-backed scan queue, abuse controls, billing limits, and dashboard observability."
                />
              </div>

              <div className="mt-6 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Guiding constraint</div>
                <div className="mt-1 text-sm font-medium text-white/90">Security defaults are non-negotiable.</div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  If a feature introduces ambiguity, it ships with guardrails or it does not ship.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card
            title="What this platform enforces"
            desc="Core controls active in production:"
            items={[
              "No decryption toggle and no unencrypted serve path",
              "Blocked delivery for failed, infected, or quarantined files",
              "Rate limits across upload, token access, serve, and abuse routes",
              "Plan limits enforced server-side for storage, shares, and monthly views",
            ]}
          />
          <Card
            title="What I optimize for"
            desc="Priorities that guide architecture decisions:"
            items={[
              "Reliable access control boundaries",
              "Operational visibility without sensitive leakage",
              "Fast, predictable UX with meaningful error states",
              "Systems that are easy to audit and recover",
            ]}
          />
        </div>

        <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">What is on this site</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Public pages describe security model, legal policy, and reporting processes. Admin pages
            run document operations with upload validation, scan enforcement, audit logging, and plan controls.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Core components include encrypted uploads, file validation, immutable audit logs, scan
            enforcement, rate limits, billing controls, and origin role boundaries.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Tag>Encrypted Uploads</Tag>
            <Tag>MIME and Signature Validation</Tag>
            <Tag>Immutable Audit Log</Tag>
            <Tag>Scan-first Serve</Tag>
            <Tag>Quarantine Enforcement</Tag>
            <Tag>Rate Limits</Tag>
            <Tag>Stripe Billing Controls</Tag>
            <Tag>Origin Role Boundaries</Tag>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/projects"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
            >
              Browse projects
            </Link>
            <Link
              href="/projects/doclinks"
              className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
            >
              See Doclinks {"->"}
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">Why this exists</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Sensitive documents deserve enforced protection and professional delivery. Doclinks is
            built deliberately, with security controls implemented at the architecture level rather
            than layered on later.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}

function Card({
  title,
  desc,
  items,
}: {
  title: string;
  desc: string;
  items: string[];
}) {
  return (
    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
      <ul className="mt-4 space-y-2 text-sm text-white/70">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
      {children}
    </span>
  );
}

function FocusRow(props: { title: string; desc: string }) {
  return (
    <div className="flex items-start justify-between gap-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div>
        <div className="text-sm font-medium text-white/90">{props.title}</div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
      </div>
    </div>
  );
}

