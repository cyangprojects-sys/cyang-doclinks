import type { Metadata } from "next";
import {
  CTAGroup,
  LinkTile,
  PremiumCard,
  Section,
  SectionHeader,
} from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";
import { getPublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export const runtime = "nodejs";
export const revalidate = 900;

export const metadata: Metadata = {
  title: "Contact - cyang.io",
  description:
    "Premium contact routing for product support, security disclosures, privacy requests, legal inquiries, and general questions.",
};

export default function ContactPage() {
  const publicConfig = getPublicRuntimeConfig();

  return (
    <SiteShell maxWidth="full" publicConfig={publicConfig}>
      <Section className="pt-8 sm:pt-12">
        <SectionHeader
          eyebrow="Contact"
          title="Get in touch."
          body="Use the route that best matches the question so product, security, legal, and privacy requests land in the right place quickly."
        />
        <CTAGroup
          className="mt-8"
          actions={[
            { href: `mailto:${publicConfig.supportEmail}`, label: "Email support", tone: "primary", external: true },
            { href: "/trust", label: "Review Trust", tone: "secondary" },
            { href: "/status", label: "View Status", tone: "secondary" },
          ]}
        />
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Contact routes"
          title="Clear paths for the questions people actually have."
          body="This page favors direct routing over friction. If you already know the topic, go straight to the right channel."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <LinkTile href={`mailto:${publicConfig.supportEmail}`} title="Product and support" body="Accounts, onboarding, product usage, and general support questions." meta={publicConfig.supportEmail} />
          <LinkTile href={`mailto:${publicConfig.securityEmail}`} title="Security disclosures" body="Private vulnerability reporting and security review follow-up." meta={publicConfig.securityEmail} />
          <LinkTile href={`mailto:${publicConfig.privacyEmail}`} title="Privacy and legal" body="Privacy requests, processor questions, and legal or procurement routing." meta={publicConfig.privacyEmail} />
          <LinkTile href={`mailto:${publicConfig.legalEmail}`} title="General inquiries" body="Commercial, company, partnership, or broader conversation starters." meta={publicConfig.legalEmail} />
        </div>
      </Section>

      <Section>
        <PremiumCard className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-sm font-semibold text-white">Product / support</div>
            <p className="mt-2 text-sm leading-7 text-white/62">Best for active customer questions, account help, and onboarding.</p>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Security disclosures</div>
            <p className="mt-2 text-sm leading-7 text-white/62">Best for responsible disclosure and product security follow-up.</p>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Privacy / legal</div>
            <p className="mt-2 text-sm leading-7 text-white/62">Best for DPA, subprocessors, retention, and privacy requests.</p>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">General inquiries</div>
            <p className="mt-2 text-sm leading-7 text-white/62">Best for broader commercial or company questions.</p>
          </div>
        </PremiumCard>
      </Section>

      <Section>
        <PremiumCard strong className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Need trust context before reaching out?
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/66">
              Review the trust center and live status first if the question depends on public operating posture,
              incident updates, or procurement evidence.
            </p>
          </div>
          <CTAGroup
            actions={[
              { href: "/trust", label: "Trust Center", tone: "primary" },
              { href: "/status", label: "Status", tone: "secondary" },
            ]}
          />
        </PremiumCard>
      </Section>
    </SiteShell>
  );
}
