import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Trust Center - cyang.io",
  description:
    "Security, privacy, legal, reliability, and reporting resources for cyang.io and Doclinks.",
};

const TRUST_FACTS = [
  "Security controls are enforced server-side.",
  "Files are delivered only after security checks pass.",
  "Legal and policy documents are publicly available.",
  "Status and incident communication are transparent.",
];

const TRUST_LINKS = [
  {
    title: "Security overview",
    body: "Platform security posture, controls, and disclosure expectations.",
    href: "/legal/security-policy",
  },
  {
    title: "Legal Center",
    body: "Terms, privacy, data processing, and platform policy documentation.",
    href: "/legal",
  },
  {
    title: "Privacy Policy",
    body: "How personal data is collected, used, and protected.",
    href: "/privacy",
  },
  {
    title: "Data Processing Addendum",
    body: "Controller/processor terms for business and procurement review.",
    href: "/legal/data-processing-addendum",
  },
  {
    title: "Service Level Agreement",
    body: "Paid-plan uptime commitment and service credit process.",
    href: "/legal/service-level-agreement",
  },
  {
    title: "Subprocessors",
    body: "Current vendors and processing purposes for service operations.",
    href: "/legal/subprocessors",
  },
  {
    title: "Status",
    body: "Live service health, incident updates, and reliability signals.",
    href: "/status",
  },
  {
    title: "Report abuse",
    body: "Report malware, phishing, policy abuse, or suspicious sharing behavior.",
    href: "/report",
  },
  {
    title: "Security disclosure",
    body: "Responsible vulnerability reporting and response expectations.",
    href: "/security-disclosure",
  },
  {
    title: "Procurement trust package",
    body: "Fast path for security, legal, and procurement document review.",
    href: "/trust/procurement",
  },
  {
    title: "Contact",
    body: "Get in touch for support, procurement, and trust questions.",
    href: "/contact",
  },
];

export default function TrustPage() {
  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Trust Center
          </span>
          <h1 className="font-editorial mt-5 max-w-5xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Security, policy, and operational trust in one place.
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            Review the controls, commitments, and reporting routes behind cyang.io and Doclinks.
            This center is designed for customers, buyers, and security evaluators who need clear trust evidence quickly.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/legal" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Open Legal Center
            </Link>
            <Link href="/status" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              View status
            </Link>
            <Link href="/trust/procurement" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Procurement package
            </Link>
            <Link href="/contact" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Contact
            </Link>
            <Link href="/report" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Report abuse
            </Link>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Trust highlights</div>
            <ul className="mt-4 space-y-2">
              {TRUST_FACTS.map((fact) => (
                <li key={fact} className="flex gap-2 text-sm leading-relaxed text-white/72">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20">
        <div className="max-w-4xl">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em]">
            Trust resources
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Find the right trust document or workflow quickly.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/72 sm:text-base">
            Use these customer-facing resources to review legal terms, evaluate security posture, monitor reliability, or escalate issues.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TRUST_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="glass-card rounded-3xl p-6 transition-colors hover:bg-white/12"
            >
              <h3 className="text-lg font-semibold tracking-tight text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{item.body}</p>
              <div className="mt-4 text-sm text-white/84">Open</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card rounded-3xl p-7 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Evaluating Doclinks for business use?
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72">
            Start with the procurement package, then review Security Policy, DPA, SLA, and Subprocessors for compliance review.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/legal/security-policy" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
              Security Policy
            </Link>
            <Link href="/legal/data-processing-addendum" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
              DPA
            </Link>
            <Link href="/legal/service-level-agreement" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
              SLA
            </Link>
            <Link href="/legal/subprocessors" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
              Subprocessors
            </Link>
            <Link href="/trust/procurement" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
              Procurement package
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
