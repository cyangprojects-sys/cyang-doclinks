import Link from "next/link";
import type { Metadata } from "next";
import { PolicyPageShell } from "@/app/components/PolicyPageShell";
import { PremiumCard, Section, SectionHeader } from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";
import LegalCenterClient from "@/app/legal/LegalCenterClient";
import { LEGAL_DOCS } from "@/lib/legalDocs";

export const runtime = "nodejs";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Legal Center - cyang.io",
  description:
    "Elegant, readable legal and policy center for cyang.io and Doclinks, covering terms, privacy, security, DPA, SLA, subprocessors, and related trust documents.",
};

export default function LegalIndexPage() {
  return (
    <SiteShell maxWidth="full">
      <PolicyPageShell
        breadcrumbs={[{ label: "cyang.io", href: "/" }, { label: "Legal Center" }]}
        eyebrow="Legal Center"
        title="Policies, terms, and review documents built to stay readable."
        body="The legal center is organized for serious review: clear typography, predictable metadata, and a public index of the documents customers, buyers, and counsel usually need."
        actions={[
          { href: "/trust", label: "Review Trust", tone: "secondary" },
          { href: "/trust/procurement", label: "Procurement Package", tone: "primary" },
        ]}
        meta={[
          { label: "Coverage", value: "Terms, privacy, security, DPA, SLA, subprocessors, and policy surfaces" },
          { label: "Format", value: "Readable public pages with source-backed markdown content" },
        ]}
        aside={
          <div className="space-y-3 text-sm text-white/62">
            <div>
              Start with <Link href="/terms" className="underline underline-offset-4 hover:text-white">Terms</Link>,{" "}
              <Link href="/privacy" className="underline underline-offset-4 hover:text-white">Privacy</Link>, and{" "}
              <Link href="/legal/security-policy" className="underline underline-offset-4 hover:text-white">Security Policy</Link>.
            </div>
            <div>
              For business review, move next to <Link href="/legal/data-processing-addendum" className="underline underline-offset-4 hover:text-white">DPA</Link>,{" "}
              <Link href="/legal/service-level-agreement" className="underline underline-offset-4 hover:text-white">SLA</Link>, and{" "}
              <Link href="/legal/subprocessors" className="underline underline-offset-4 hover:text-white">Subprocessors</Link>.
            </div>
          </div>
        }
      />

      <Section>
        <SectionHeader
          eyebrow="Trust continuity"
          title="Legal pages are part of the public trust shell."
          body="They carry the same design discipline as the product site, but stay restrained enough to preserve legal clarity."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Readable structure</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Narrower line lengths, stronger heading rhythm, and calmer chrome.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Reviewable metadata</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Dates, applicability, and document relationships stay visible without clutter.</p>
          </PremiumCard>
          <PremiumCard>
            <div className="text-xl font-semibold text-white">Connected surfaces</div>
            <p className="mt-3 text-sm leading-7 text-white/62">Trust, procurement, disclosure, and status are one system rather than disconnected pages.</p>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <LegalCenterClient docs={LEGAL_DOCS} />
      </Section>
    </SiteShell>
  );
}
