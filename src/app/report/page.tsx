import type { Metadata } from "next";
import { PolicyPageShell } from "@/app/components/PolicyPageShell";
import { DocumentIndexList, PremiumCard, Section } from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";
import ReportForm from "./ReportForm";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Report Abuse - cyang.io",
  description:
    "Report malware, phishing, illegal content, policy abuse, or suspicious sharing behavior through the cyang.io trust and safety route.",
};

export default function ReportPage() {
  return (
    <SiteShell maxWidth="full">
      <PolicyPageShell
        breadcrumbs={[
          { label: "cyang.io", href: "/" },
          { label: "Trust", href: "/trust" },
          { label: "Report Abuse" },
        ]}
        eyebrow="Trust and Safety"
        title="Report abuse clearly and quickly."
        body="Use this page to report malware, phishing, illegal content, policy abuse, or suspicious sharing behavior. Reports enter moderation and containment workflows designed to reduce further exposure."
        meta={[
          { label: "Workflow", value: "Moderation review, containment, and security logging" },
          { label: "Best input", value: "Share token, alias, or link plus a short factual description" },
        ]}
      />

      <Section>
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ReportForm />
          </div>
          <div className="space-y-4 lg:col-span-4">
            <PremiumCard>
              <div className="text-xl font-semibold text-white">What you can report</div>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-white/62">
                <li>Malware or suspicious file behavior</li>
                <li>Phishing or impersonation attempts</li>
                <li>Illegal or prohibited content</li>
                <li>Policy abuse or suspicious sharing patterns</li>
              </ul>
            </PremiumCard>
            <PremiumCard>
              <div className="text-xl font-semibold text-white">Before you submit</div>
              <p className="mt-3 text-sm leading-7 text-white/62">Include the link, token, or alias when possible and describe exactly what you observed.</p>
            </PremiumCard>
          </div>
        </div>
      </Section>

      <Section>
        <DocumentIndexList
          items={[
            { href: "/acceptable-use", title: "Acceptable Use", body: "Platform safety rules and abuse boundaries." },
            { href: "/security-disclosure", title: "Security Disclosure", body: "Use this route for vulnerabilities rather than content abuse." },
            { href: "/status", title: "Status", body: "Operational updates and service health." },
            { href: "/contact", title: "Contact", body: "General contact routing for non-abuse questions." },
          ]}
        />
      </Section>
    </SiteShell>
  );
}
