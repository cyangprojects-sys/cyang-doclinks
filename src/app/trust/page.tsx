import type { Metadata } from "next";
import {
  CTAGroup,
  DocumentIndexList,
  LinkTile,
  PremiumCard,
  Section,
  SectionHeader,
} from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "Trust - cyang.io",
  description:
    "Trust, made reviewable: security, privacy, legal, status, procurement, and disclosure surfaces for cyang.io and Doclinks.",
};

const PILLARS = [
  { href: "/legal/security-policy", title: "Security", body: "Customer-facing security controls and operating posture.", meta: "Controls" },
  { href: "/privacy", title: "Privacy", body: "How data is handled, retained, and protected.", meta: "Data handling" },
  { href: "/legal", title: "Legal", body: "Terms, processor terms, policy documents, and legal references.", meta: "Policies" },
  { href: "/status", title: "Status", body: "Operational health, updates, and incident visibility.", meta: "Operations" },
  { href: "/trust/procurement", title: "Procurement", body: "Business-ready trust package and review path.", meta: "Buyer review" },
  { href: "/security-disclosure", title: "Responsible Disclosure", body: "Report vulnerabilities privately with clear expectations.", meta: "Disclosure" },
];

const PRINCIPLES = [
  "Controls are enforced server-side rather than left to good behavior.",
  "Scan-gated delivery blocks unsafe file states before public access.",
  "Bounded access and lifecycle constraints reduce stale exposure.",
  "Public operating surfaces stay visible enough for serious review.",
];

const DOCUMENTS = [
  { href: "/terms", title: "Terms", body: "Service agreement, account obligations, and commercial baseline." },
  { href: "/privacy", title: "Privacy", body: "Data collection, usage, rights, and safeguards." },
  { href: "/acceptable-use", title: "Acceptable Use", body: "Platform safety rules and abuse boundaries." },
  { href: "/legal/data-processing-addendum", title: "DPA", body: "Controller/processor terms for business review." },
  { href: "/legal/service-level-agreement", title: "SLA", body: "Availability commitments and service credit process." },
  { href: "/legal/subprocessors", title: "Subprocessors", body: "Third-party processing transparency." },
  { href: "/data-retention", title: "Data Retention", body: "Lifecycle and retention expectations." },
  { href: "/legal/security-policy", title: "Security Policy", body: "Control summary and response posture." },
  { href: "/security-disclosure", title: "Security Disclosure", body: "Responsible disclosure workflow." },
  { href: "/report", title: "Abuse reporting", body: "Report malware, policy abuse, or suspicious sharing." },
];

export default function TrustPage() {
  return (
    <SiteShell maxWidth="full">
      <Section className="pt-8 sm:pt-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.06fr)_380px] lg:items-end">
          <div className="max-w-4xl">
            <SectionHeader
              eyebrow="Trust hub"
              title="Trust, made reviewable."
              body="cyang.io exposes the security, policy, status, and procurement surfaces customers need to evaluate the platform quickly."
            />
            <CTAGroup
              className="mt-8"
              actions={[
                { href: "/status", label: "View Status", tone: "secondary" },
                { href: "/contact", label: "Contact", tone: "primary" },
              ]}
            />
          </div>

          <PremiumCard strong>
            <div className="text-xl font-semibold text-white">Review posture</div>
            <p className="mt-3 text-sm leading-7 text-white/64">
              The trust surface is structured so buyers, legal reviewers, and security evaluators can reach the right
              documents without guesswork.
            </p>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Six pillars"
          title="A trust system organized by the questions reviewers actually ask."
          body="Each pillar routes into a concrete operating surface, not a vague marketing claim."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PILLARS.map((item) => (
            <LinkTile key={item.href} href={item.href} title={item.title} body={item.body} meta={item.meta} />
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <PremiumCard strong>
            <SectionHeader
              eyebrow="Operating principles"
              title="Trust is anchored in operating behavior."
              body="These principles are visible across the product, legal, and status layers."
            />
          </PremiumCard>

          <PremiumCard>
            <ul className="space-y-4">
              {PRINCIPLES.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-7 text-white/68">
                  <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-sky-300/90" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Policy and document index"
          title="Core trust documents in one premium index."
          body="Use this list as the fastest route to legal, privacy, security, and reporting documentation."
        />
        <div className="mt-8">
          <DocumentIndexList items={DOCUMENTS} />
        </div>
      </Section>

      <Section>
        <PremiumCard strong className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Need procurement, support, or trust review help?
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/66">
              The trust shell is public by default. For follow-up, route directly into contact or live operations.
            </p>
          </div>
          <CTAGroup
            actions={[
              { href: "/contact", label: "Contact", tone: "primary" },
              { href: "/status", label: "View Status", tone: "secondary" },
            ]}
          />
        </PremiumCard>
      </Section>
    </SiteShell>
  );
}
