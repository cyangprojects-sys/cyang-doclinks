import type { Metadata } from "next";
import { PolicyPageShell } from "@/app/components/PolicyPageShell";
import { DocumentIndexList, PremiumCard, Section } from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";
import { getPrivacyEmail } from "@/lib/legal";

export const runtime = "nodejs";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Data Retention - cyang.io",
  description:
    "Data lifecycle and retention expectations for cyang.io and Doclinks, covering document handling, security events, cleanup, and recovery posture.",
};

export default function DataRetentionPage() {
  const privacyEmail = getPrivacyEmail();

  return (
    <SiteShell maxWidth="full">
      <PolicyPageShell
        breadcrumbs={[
          { label: "cyang.io", href: "/" },
          { label: "Trust", href: "/trust" },
          { label: "Data Retention" },
        ]}
        eyebrow="Data Retention"
        title="Data lifecycle, retention, and cleanup made explicit."
        body="This page summarizes how document data, security telemetry, and operational records are retained and reviewed across the cyang.io platform."
        actions={[
          { href: "/privacy", label: "Privacy Policy", tone: "secondary" },
          { href: `mailto:${privacyEmail}`, label: "Contact privacy", tone: "primary", external: true },
        ]}
        meta={[
          { label: "Contact", value: privacyEmail },
          { label: "Scope", value: "Documents, security events, cleanup, backup, and recovery posture" },
        ]}
      />

      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Document lifecycle</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Documents are tracked with lifecycle metadata and served only while policy allows.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Security and audit retention</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Security and audit events are kept long enough to support review, investigation, and operational confidence.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Cleanup jobs</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Scheduled cleanup supports consistency and reduces stale objects or expired sharing paths.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Backups and recovery</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Recovery procedures and retention windows are aligned to broader incident and continuity needs.</p>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <DocumentIndexList
          items={[
            { href: "/privacy", title: "Privacy Policy", body: "Baseline data-handling commitments." },
            { href: "/legal/data-processing-addendum", title: "DPA", body: "Processor terms for business customers." },
            { href: "/legal/subprocessors", title: "Subprocessors", body: "Vendor transparency for data handling." },
            { href: "/trust", title: "Trust Center", body: "Return to the broader trust review hub." },
          ]}
        />
      </Section>
    </SiteShell>
  );
}
