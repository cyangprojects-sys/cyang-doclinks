import type { Metadata } from "next";
import { PolicyPageShell } from "@/app/components/PolicyPageShell";
import { DocumentIndexList, PremiumCard, Section } from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";
import { getSecurityEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Security Disclosure - cyang.io",
  description:
    "Responsible disclosure process for cyang.io and Doclinks, including contact, testing expectations, scope, and response posture.",
};

export default function SecurityDisclosurePage() {
  const securityEmail = getSecurityEmail();

  return (
    <SiteShell maxWidth="full">
      <PolicyPageShell
        breadcrumbs={[
          { label: "cyang.io", href: "/" },
          { label: "Trust", href: "/trust" },
          { label: "Security Disclosure" },
        ]}
        eyebrow="Security Disclosure"
        title="Responsible disclosure with clear expectations."
        body="If you find a potential vulnerability, report it privately. cyang.io treats good-faith security reports seriously and coordinates remediation with direct communication."
        actions={[
          { href: `mailto:${securityEmail}`, label: `Email ${securityEmail}`, tone: "primary", external: true },
          { href: "/trust", label: "Trust Center", tone: "secondary" },
        ]}
        meta={[
          { label: "Primary route", value: securityEmail },
          { label: "Acknowledgment target", value: "Within 2 business days" },
        ]}
      />

      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          <PremiumCard>
            <div className="text-xl font-semibold text-white">How to report</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Share the affected route or workflow, steps to reproduce, expected behavior, actual behavior, and potential impact.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Priority scope</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Auth and tenancy issues, encryption or serve-path failures, scan bypasses, and token abuse vectors are especially important.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Testing expectations</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Do not access data you do not own, avoid destructive testing, and keep details private while remediation is active.</p>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <DocumentIndexList
          items={[
            { href: "/legal/security-policy", title: "Security Policy", body: "Customer-facing security controls and posture." },
            { href: "/status", title: "Status", body: "Operational updates and public service health." },
            { href: "/report", title: "Report abuse", body: "Trust and safety escalation route." },
            { href: "/contact", title: "Contact", body: "General contact routing if the issue is not a vulnerability report." },
          ]}
        />
      </Section>
    </SiteShell>
  );
}
