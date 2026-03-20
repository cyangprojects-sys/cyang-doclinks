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
  title: "cyang.io - Cinematic secure workflow software",
  description:
    "cyang.io is a disciplined product studio for secure workflow software, with Doclinks as the flagship and trust designed into the public operating shell.",
};

const STUDIO_ITEMS = [
  {
    href: "/doclinks",
    title: "Doclinks",
    body: "Controlled external document delivery with bounded access, scan-gated serving, and audit visibility.",
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
    eyebrow: "Controlled",
    title: "Control is enforced at the system boundary.",
    body: "cyang.io products are designed so the important rules still hold after a file leaves your workspace.",
    signal: [
      { label: "Serve posture", value: "Policy checked at request time" },
      { label: "Access", value: "Bounded instead of open-ended" },
      { label: "Lifecycle", value: "Expiration and revocation are first-class" },
    ],
  },
  {
    eyebrow: "Auditable",
    title: "Visibility exists to support trust, not noise.",
    body: "The experience stays calm for recipients while the product keeps the delivery trail legible enough for real operational follow-up.",
    signal: [
      { label: "Review path", value: "Audit-friendly delivery activity" },
      { label: "Supportability", value: "Clear events and states" },
      { label: "Confidence", value: "Evidence over vague claims" },
    ],
  },
  {
    eyebrow: "Operational",
    title: "Status, legal, and disclosure are part of the product shell.",
    body: "Trust surfaces are designed into the public architecture so customers and buyers can evaluate the company without hunting through loose links.",
    signal: [
      { label: "Status", value: "Public operating posture" },
      { label: "Legal", value: "Readable, reviewable document shells" },
      { label: "Procurement", value: "Buyer-ready continuity" },
    ],
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
        className="mt-3 min-h-[96svh] border-b border-white/8"
        contentClassName="min-h-[96svh]"
      >
        <AmbientScene tone="cool" />
        <div className="mx-auto flex min-h-[96svh] w-full max-w-[1600px] flex-col justify-between px-4 pb-10 pt-18 sm:px-6 sm:pb-12 lg:px-8 lg:pt-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_360px] lg:items-end">
            <ScrollRevealFrame className="max-w-5xl">
              <Eyebrow>cyang.io product studio</Eyebrow>
              <h1 className="font-editorial mt-6 text-balance text-[3.25rem] leading-[0.9] tracking-[-0.06em] text-white sm:text-[4.75rem] lg:text-[7.5rem]">
                Secure workflow software,
                <span className="block text-white/64">staged like controlled infrastructure.</span>
              </h1>
              <Lead className="mt-6 max-w-2xl text-base sm:text-xl">
                Products for high-trust sharing, policy-aware delivery, and operational clarity.
              </Lead>
              <CTAGroup
                className="mt-8"
                actions={[
                  { href: "/doclinks", label: "Explore Doclinks", tone: "primary" },
                  { href: "/products", label: "View Products", tone: "secondary" },
                ]}
              />
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120} className="floating-stage p-6 sm:p-7">
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/36">Launch surface</div>
              <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">A public shell built to feel decisive.</div>
              <p className="mt-4 text-sm leading-7 text-white/62">
                cyang.io is positioned as a serious software studio: flagship product first, trust architecture
                visible, and room to grow without losing discipline.
              </p>
              <div className="story-seam mt-6 h-28 rounded-[1.5rem]" />
              <VisualSignalCluster
                className="mt-4"
                title="Immediate signals"
                items={[
                  { label: "Flagship", value: "Doclinks leads the public story." },
                  { label: "Differentiator", value: "Trust is visible enough to review." },
                  { label: "Posture", value: "Calm, technical, and security-minded." },
                ]}
              />
            </ScrollRevealFrame>
          </div>

          <ScrollRevealFrame delay={220} className="mt-10">
            <div className="grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/58">Current flagship</div>
                <div className="mt-2 text-lg text-white/86">Doclinks</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/58">Public proof</div>
                <div className="mt-2 text-lg text-white/86">Status, legal, disclosure, procurement</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/58">Operating tone</div>
                <div className="mt-2 text-lg text-white/86">Controlled, auditable, operational</div>
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
                eyebrow="Flagship Doclinks"
                title={
                  <>
                    Controlled document delivery,
                    <span className="block text-white/64">revealed as the center of the studio.</span>
                  </>
                }
                body="Doclinks is the flagship because it expresses the entire cyang.io thesis in one product: tighter boundaries, better recipient experience, and public trust surfaces that already exist."
                aside={
                  <div className="floating-stage p-5 sm:p-6">
                    <DocumentVisual
                      rows={[
                        { label: "Access policy", value: "Tokenized + serve-time checked", tone: "accent" },
                        { label: "Delivery state", value: "Scan-gated before release", tone: "neutral" },
                        { label: "Lifecycle", value: "Expiration and revocation active", tone: "warm" },
                      ]}
                      footer="No generic dashboard chrome. Just the abstract signals that matter."
                    />
                  </div>
                }
              >
                <CTAGroup
                  actions={[
                    { href: "/doclinks", label: "Learn about Doclinks", tone: "primary" },
                    { href: "/trust", label: "Review Trust", tone: "secondary" },
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
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/32">{band.eyebrow}</div>
                    <h2 className="mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                      {band.title}
                    </h2>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-white/64 sm:text-lg">{band.body}</p>
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
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Product studio</div>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                Broader than one product. Still sharply edited.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-white/64 sm:text-lg">
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

      <SectionTransition label="Proof architecture" />

      <Section className="py-20 sm:py-24">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="floating-stage overflow-hidden p-6 sm:p-8 lg:p-10">
              <AmbientScene tone="signal" className="opacity-75" />
              <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Trust and proof</div>
                  <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                    Trust shown as architecture, not a loose link dump.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-8 text-white/64 sm:text-lg">
                    Status, legal, disclosure, retention, and procurement are visible enough to signal seriousness within seconds.
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
                <div className="grid h-28 w-28 place-items-center rounded-[2rem] border border-white/12 bg-white/[0.05] text-3xl font-semibold tracking-[0.08em] text-white">
                  CY
                </div>
                <div className="mt-6 text-lg font-semibold text-white">Built by Chang Yang</div>
              </div>
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120}>
              <div className="px-0 py-2 sm:px-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Founder statement</div>
                <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Practical software, architecture-level controls, and no appetite for noise.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-white/64 sm:text-lg">
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
        className="min-h-[70svh] border-t border-white/8"
        contentClassName="min-h-[70svh]"
      >
        <AmbientScene tone="steel" />
        <div className="mx-auto flex min-h-[70svh] w-full max-w-[1600px] items-end px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <ScrollRevealFrame className="max-w-4xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Final close</div>
            <h2 className="mt-4 text-balance text-[3rem] font-semibold tracking-[-0.06em] text-white sm:text-[4.5rem] lg:text-[6rem]">
              Start with the flagship.
              <span className="block text-white/60">Then follow the system outward.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/64 sm:text-lg">
              The site is designed so customers, buyers, and future partners can understand the hierarchy quickly and remember it later.
            </p>
            <CTAGroup
              className="mt-8"
              actions={[
                { href: "/doclinks", label: "Explore Doclinks", tone: "primary" },
                { href: "/products", label: "Explore the portfolio", tone: "secondary" },
                { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Get started" : "Sign in", tone: "secondary" },
              ]}
            />
          </ScrollRevealFrame>
        </div>
      </BackgroundVideoSection>
    </SiteShell>
  );
}
