import type { Metadata } from "next";
import { BackgroundVideoSection, ScrollRevealFrame } from "./components/CinematicClient";
import { AmbientScene, SectionTransition, StoryBand, VisualSignalCluster } from "./components/CinematicScene";
import {
  CTAGroup,
  ContentRail,
  DocumentIndexList,
  DocumentVisual,
  Eyebrow,
  Lead,
  LinkTile,
  MaturityBadge,
  PremiumCard,
  Section,
} from "./components/PublicPrimitives";
import { SiteShell } from "./components/SiteShell";
import { getPublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "cyang.io - Secure document sharing with control after send",
  description:
    "Doclinks helps teams securely share sensitive documents, keep control after sending, and prove trust through real security, legal, and operational surfaces.",
};

const STUDIO_ITEMS = [
  {
    href: "/doclinks",
    title: "Doclinks",
    body: "Securely share sensitive documents with access controls, visibility, and control after send.",
    badge: <MaturityBadge tone="live">Flagship</MaturityBadge>,
    meta: "Live now",
  },
  {
    href: "/trust",
    title: "Trust Systems",
    body: "A reviewable operating layer for legal, security, status, disclosure, and procurement surfaces.",
    badge: <MaturityBadge tone="build">Platform trust</MaturityBadge>,
    meta: "Growing system",
  },
  {
    href: "/products",
    title: "Systems Lab",
    body: "A future-facing lane for adjacent workflow products that can inherit the same discipline without losing focus.",
    badge: <MaturityBadge tone="lab">Expansion path</MaturityBadge>,
    meta: "Studio direction",
  },
];

const TRUST_DOCUMENTS = [
  { href: "/status", title: "Status", body: "Public operational health and updates." },
  { href: "/trust", title: "Trust Center", body: "A structured review path for controls, privacy, and operations." },
  { href: "/legal", title: "Legal Center", body: "Terms, privacy, DPA, SLA, and policy documentation." },
  { href: "/security-disclosure", title: "Security Disclosure", body: "Responsible disclosure expectations and contact routes." },
  { href: "/data-retention", title: "Data Retention", body: "Lifecycle and retention expectations for files and records." },
  { href: "/trust/procurement", title: "Procurement Package", body: "Fast path for business, legal, and security review." },
];

const OPERATING_BANDS = [
  {
    eyebrow: "Upload",
    title: "Start with a secure upload path, not an email attachment.",
    body: "Files enter a protected path with validation, storage boundaries, and a clean workflow state from the beginning.",
    signal: [
      { label: "Input", value: "Validated before delivery" },
      { label: "Storage", value: "Private by default" },
      { label: "Intent", value: "Built for sensitive files" },
    ],
  },
  {
    eyebrow: "Protect",
    title: "Set access rules before the file ever leaves your hands.",
    body: "Attach expiration, revocation, download posture, and bounded access rules to the share instead of hoping the recipient handles it carefully.",
    signal: [
      { label: "Access", value: "Tokenized and policy-bound" },
      { label: "Lifecycle", value: "Expiry and revocation built in" },
      { label: "Risk posture", value: "Less stale exposure" },
    ],
  },
  {
    eyebrow: "Share",
    title: "Send a protected link instead of an unbounded file.",
    body: "Recipients get a calm, professional delivery experience while the system keeps the control layer on the server side.",
    signal: [
      { label: "Recipient UX", value: "Clear and professional" },
      { label: "Serving", value: "Checked in real time" },
      { label: "Experience", value: "Simple for both sides" },
    ],
  },
  {
    eyebrow: "Control",
    title: "Keep control after sending.",
    body: "See what happened, revoke when needed, and rely on public trust surfaces that support serious review when buyers or stakeholders ask questions.",
    signal: [
      { label: "Visibility", value: "Reviewable delivery activity" },
      { label: "Trust", value: "Status, legal, and disclosure visible" },
      { label: "Follow-up", value: "Control does not end at send" },
    ],
  },
];

const AUDIENCE_ITEMS = [
  {
    title: "Finance and operations",
    body: "For invoices, statements, closing documents, and other files that should not bounce around as attachments.",
  },
  {
    title: "HR and people workflows",
    body: "For onboarding, records, and sensitive personnel documents that need a more deliberate delivery path.",
  },
  {
    title: "Legal and compliance-heavy teams",
    body: "For contracts, notices, and review materials where control, retention, and follow-up matter.",
  },
];

export default function HomePage() {
  const publicConfig = getPublicRuntimeConfig();
  const primaryAccessHref = publicConfig.signupEnabled ? "/signup" : "/signin?intent=admin";

  return (
    <SiteShell maxWidth="full" publicConfig={publicConfig}>
      <BackgroundVideoSection
        src="/media/cyang-hero-atmosphere.mp4"
        poster="/media/cyang-hero-atmosphere.jpg"
        priority
        className="mt-3 min-h-[96svh] border-b border-[var(--border-subtle)]"
        contentClassName="min-h-[96svh]"
      >
        <AmbientScene tone="cool" />
        <div className="mx-auto flex min-h-[96svh] w-full max-w-[1600px] flex-col justify-between px-4 pb-10 pt-18 sm:px-6 sm:pb-12 lg:px-8 lg:pt-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_360px] lg:items-end">
            <ScrollRevealFrame className="max-w-5xl">
              <Eyebrow>cyang.io product studio</Eyebrow>
              <h1 className="font-editorial mt-6 text-balance text-[3.25rem] leading-[0.9] tracking-[-0.06em] text-slate-950 sm:text-[4.75rem] lg:text-[7.5rem]">
                Securely share sensitive documents
                <span className="block text-[var(--text-muted)]">and keep control after sending.</span>
              </h1>
              <Lead className="mt-6 max-w-2xl text-base sm:text-xl">
                Doclinks gives teams a safer way to send private files, replace careless attachments, and keep access
                controls, visibility, and trust intact after send.
              </Lead>
              <CTAGroup
                className="mt-8"
                actions={[
                  { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Get started" : "Sign in", tone: "primary" },
                  {
                    href: publicConfig.showPricingUi ? "/pricing" : "/doclinks",
                    label: publicConfig.showPricingUi ? "View pricing" : "Explore Doclinks",
                    tone: "secondary",
                  },
                ]}
              />
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120} className="floating-stage p-6 sm:p-7">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Launch surface</div>
              <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                A safer way to send files that should stay under control.
              </div>
              <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                Built for contracts, HR records, financial files, and other documents that are too sensitive for
                ordinary attachments or casual file links.
              </p>
              <div className="story-seam mt-6 h-28" />
              <VisualSignalCluster
                className="mt-4"
                title="Immediate signals"
                items={[
                  { label: "Use case", value: "Sensitive document sharing" },
                  { label: "Differentiator", value: "Control stays with the sender" },
                  { label: "Proof", value: "Trust surfaces are public and reviewable" },
                ]}
              />
            </ScrollRevealFrame>
          </div>

          <ScrollRevealFrame delay={220} className="mt-10">
            <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-5 sm:grid-cols-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">What it is</div>
                <div className="mt-2 text-lg text-[var(--text-primary)]">Secure document sharing for sensitive files</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Why it is better</div>
                <div className="mt-2 text-lg text-[var(--text-primary)]">More control than email attachments or generic links</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">Why trust it</div>
                <div className="mt-2 text-lg text-[var(--text-primary)]">Trust, legal, status, and disclosure are visible now</div>
              </div>
            </div>
          </ScrollRevealFrame>
        </div>
      </BackgroundVideoSection>

      <SectionTransition label="Flagship reveal" />

      <Section className="py-20 sm:py-24">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-end">
              <div className="hidden lg:block">
                <div className="editorial-kicker">DOC</div>
              </div>
              <StoryBand
                eyebrow="Why this exists"
                title={
                  <>
                    Email attachments end too early.
                    <span className="block text-[var(--text-muted)]">Sensitive document delivery should not.</span>
                  </>
                }
                body="Doclinks exists for teams that still need to send private files outside their workspace but do not want access, timing, or recipient behavior to become guesswork the moment a file is shared."
                aside={
                  <div className="floating-stage p-5 sm:p-6">
                    <DocumentVisual
                      rows={[
                        { label: "Private files", value: "Contracts, records, financial docs", tone: "accent" },
                        { label: "Delivery state", value: "Protected link instead of loose attachment", tone: "neutral" },
                        { label: "Sender control", value: "Expiration and revocation stay available", tone: "warm" },
                      ]}
                      footer="The point is simple: send the file, keep the control layer."
                    />
                  </div>
                }
              >
                <CTAGroup
                  actions={[
                    { href: "/doclinks", label: "See how Doclinks works", tone: "primary" },
                    {
                      href: publicConfig.showPricingUi ? "/pricing" : "/trust",
                      label: publicConfig.showPricingUi ? "View pricing" : "Review Trust",
                      tone: "secondary",
                    },
                  ]}
                />
              </StoryBand>
            </div>
          </ScrollRevealFrame>
        </ContentRail>
      </Section>

      <SectionTransition label="Operating thesis" />

      <Section className="py-20 sm:py-24">
        <ContentRail className="space-y-14">
          {OPERATING_BANDS.map((band, index) => (
            <ScrollRevealFrame key={band.eyebrow} delay={index * 90}>
              <div className="floating-stage relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
                <AmbientScene tone={index === 2 ? "steel" : "cool"} className="opacity-80" />
                <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">{band.eyebrow}</div>
                    <h2 className="mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl lg:text-6xl">
                      {band.title}
                    </h2>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">{band.body}</p>
                  </div>
                  <VisualSignalCluster title={`${band.eyebrow} signals`} items={band.signal} />
                </div>
              </div>
            </ScrollRevealFrame>
          ))}
        </ContentRail>
      </Section>

      <SectionTransition label="Studio expansion" />

      <Section className="py-20 sm:py-24">
        <ContentRail>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
            <ScrollRevealFrame className="lg:sticky lg:top-28">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Product studio</div>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl lg:text-6xl">
                Broader than one product. Still sharply edited.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                The studio is built to hold future systems without losing the clarity that makes the flagship credible.
              </p>
            </ScrollRevealFrame>

            <div className="grid gap-4 sm:grid-cols-2">
              {STUDIO_ITEMS.map((item, index) => (
                <ScrollRevealFrame
                  key={item.href}
                  delay={120 + index * 90}
                  className={index === 1 ? "sm:translate-y-8" : index === 2 ? "sm:-translate-y-4 sm:col-span-2" : undefined}
                >
                  <LinkTile
                    href={item.href}
                    title={item.title}
                    body={item.body}
                    meta={item.meta}
                    badge={item.badge}
                    ctaLabel="Open"
                  />
                </ScrollRevealFrame>
              ))}
            </div>
          </div>
        </ContentRail>
      </Section>

      <SectionTransition label="Who it is for" />

      <Section className="py-18 sm:py-22">
        <ContentRail>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <ScrollRevealFrame>
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Who it is for</div>
                <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl">
                  For people who cannot afford careless sharing.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  Doclinks is designed for real business workflows where a file still needs to move, but the sender wants
                  a more controlled path than inbox forwarding or generic file storage links.
                </p>
              </div>
            </ScrollRevealFrame>

            <div className="grid gap-4 md:grid-cols-3">
              {AUDIENCE_ITEMS.map((item, index) => (
                <ScrollRevealFrame key={item.title} delay={index * 90}>
                  <PremiumCard className="h-full">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-faint)]">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.title}</div>
                    <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">{item.body}</p>
                  </PremiumCard>
                </ScrollRevealFrame>
              ))}
            </div>
          </div>
        </ContentRail>
      </Section>

      <SectionTransition label="Proof architecture" />

      <Section className="py-20 sm:py-24">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="floating-stage overflow-hidden p-6 sm:p-8 lg:p-10">
              <AmbientScene tone="signal" className="opacity-75" />
              <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Trust and proof</div>
                  <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl lg:text-6xl">
                    Trust proof that supports the product story.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                    Security, legal, status, disclosure, retention, and procurement are all available because secure
                    sharing only feels credible when the company is reviewable too.
                  </p>
                </div>
                <DocumentIndexList items={TRUST_DOCUMENTS} />
              </div>
            </div>
          </ScrollRevealFrame>
        </ContentRail>
      </Section>

      <Section className="py-18 sm:py-22">
        <ContentRail>
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
            <ScrollRevealFrame>
              <div className="floating-stage flex min-h-[320px] flex-col items-center justify-center text-center p-8">
                <div className="grid h-28 w-28 place-items-center rounded-sm border border-[var(--border-subtle)] bg-white text-3xl font-semibold tracking-[0.08em] text-slate-950 shadow-[var(--shadow-soft)]">
                  CY
                </div>
                <div className="mt-6 text-lg font-semibold text-slate-950">Built by Chang Yang</div>
              </div>
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120}>
              <div className="px-0 py-2 sm:px-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Founder statement</div>
                <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-5xl">
                  Practical software, architecture-level controls, and no appetite for noise.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  cyang.io is built as a long-term home for useful systems that remain calm on the surface and strict
                  where risk actually lives.
                </p>
                <CTAGroup className="mt-8" actions={[{ href: "/about", label: "About cyang.io", tone: "secondary" }]} />
              </div>
            </ScrollRevealFrame>
          </div>
        </ContentRail>
      </Section>

      <BackgroundVideoSection
        src="/media/cyang-doclinks-signal.mp4"
        poster="/media/cyang-doclinks-signal.jpg"
        className="min-h-[70svh] border-t border-[var(--border-subtle)]"
        contentClassName="min-h-[70svh]"
      >
        <AmbientScene tone="steel" />
        <div className="mx-auto flex min-h-[70svh] w-full max-w-[1600px] items-end px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <ScrollRevealFrame className="max-w-4xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Final close</div>
            <h2 className="mt-4 text-balance text-[3rem] font-semibold tracking-[-0.06em] text-slate-950 sm:text-[4.5rem] lg:text-[6rem]">
              Send the document.
              <span className="block text-[var(--text-muted)]">Keep the control.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
              Start with Doclinks if you need a clearer, safer way to share sensitive files. Review pricing, trust, and
              product detail without leaving the public site.
            </p>
            <CTAGroup
              className="mt-8"
              actions={[
                { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Get started" : "Sign in", tone: "primary" },
                {
                  href: publicConfig.showPricingUi ? "/pricing" : "/doclinks",
                  label: publicConfig.showPricingUi ? "View pricing" : "Explore Doclinks",
                  tone: "secondary",
                },
                { href: "/trust", label: "Review Trust", tone: "secondary" },
              ]}
            />
          </ScrollRevealFrame>
        </div>
      </BackgroundVideoSection>
    </SiteShell>
  );
}
