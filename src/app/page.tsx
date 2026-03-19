import type { Metadata } from "next";
import {
  CTAGroup,
  CinematicHero,
  DocumentVisual,
  Eyebrow,
  Lead,
  LinkTile,
  MaturityBadge,
  PremiumCard,
  PrinciplesGrid,
  Section,
  SectionHeader,
} from "./components/PublicPrimitives";
import { SiteShell } from "./components/SiteShell";
import { getPublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "cyang.io - Premium secure workflow software",
  description:
    "cyang.io is a disciplined product studio for secure workflow software, with Doclinks as the flagship and trust as part of the public operating system.",
};

const PRINCIPLES = [
  {
    title: "Controlled",
    body: "Serve-time policy checks, bounded exposure, and deliberate access behavior.",
    microcopy: "Access is governed, not implied.",
  },
  {
    title: "Auditable",
    body: "Delivery behavior stays legible enough for support, follow-up, and trust review.",
    microcopy: "Visibility supports accountability.",
  },
  {
    title: "Operational",
    body: "Public status, legal surfaces, and review paths are designed as part of the product shell.",
    microcopy: "Trust is discoverable.",
  },
];

const STUDIO_STRIP = [
  {
    href: "/doclinks",
    title: "Doclinks",
    body: "Controlled external document delivery for high-trust workflows.",
    badge: <MaturityBadge tone="live">Flagship</MaturityBadge>,
    meta: "Live now",
  },
  {
    href: "/trust",
    title: "Trust Systems",
    body: "The legal, status, security, and procurement architecture behind the product surface.",
    badge: <MaturityBadge tone="build">Growing</MaturityBadge>,
    meta: "Platform trust",
  },
  {
    href: "/products",
    title: "Systems Lab",
    body: "A disciplined lane for future products and operational tooling built on the same posture.",
    badge: <MaturityBadge tone="lab">Expansion path</MaturityBadge>,
    meta: "Studio portfolio",
  },
];

const PROOF_ITEMS = [
  { href: "/status", title: "Status", body: "Public health and operational updates.", meta: "Live proof" },
  { href: "/trust", title: "Trust Center", body: "A structured review path for security, privacy, and operations.", meta: "Review path" },
  { href: "/legal", title: "Legal Center", body: "Terms, privacy, data processing, and reliability commitments.", meta: "Policy shell" },
  { href: "/security-disclosure", title: "Security Disclosure", body: "Responsible disclosure expectations and contact routes.", meta: "Disclosure" },
  { href: "/data-retention", title: "Data Retention", body: "Lifecycle and retention expectations for documents and operations.", meta: "Retention" },
  { href: "/trust/procurement", title: "Procurement Package", body: "Fast path for business, security, and legal review.", meta: "Buyer ready" },
];

function HeroVisual() {
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <DocumentVisual
        rows={[
          { label: "Access policy", value: "Required before serve", tone: "accent" },
          { label: "Document state", value: "Scanned and reviewable", tone: "neutral" },
          { label: "Delivery window", value: "Bounded by lifecycle rules", tone: "warm" },
          { label: "Audit posture", value: "Event visibility active", tone: "neutral" },
        ]}
        footer="Abstract control states stand in for the product philosophy: calm visuals, clear boundaries, no dashboard clutter."
      />
    </div>
  );
}

export default function HomePage() {
  const publicConfig = getPublicRuntimeConfig();
  const primaryAccessHref = publicConfig.signupEnabled ? "/signup" : "/signin?intent=admin";

  return (
    <SiteShell maxWidth="full" publicConfig={publicConfig}>
      <CinematicHero
        eyebrow="cyang.io product studio"
        title={
          <>
            Secure workflow software,
            <span className="block text-white/66">designed to stay controlled.</span>
          </>
        }
        body="Products for high-trust sharing, policy-aware delivery, and operational clarity."
        actions={[
          { href: "/doclinks", label: "Explore Doclinks", tone: "primary" },
          { href: "/products", label: "View Products", tone: "secondary" },
        ]}
        stats={[
          { label: "Flagship", value: "Doclinks", detail: "Controlled external document delivery." },
          { label: "Differentiator", value: "Reviewable trust posture", detail: "Status, legal, and security surfaces are public." },
          { label: "Approach", value: "Calm execution", detail: "Tighter scope. Higher discipline." },
        ]}
        visual={<HeroVisual />}
      />

      <Section>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
          <PremiumCard strong>
            <Eyebrow>Flagship product</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">Doclinks</h2>
            <Lead className="mt-4 max-w-2xl">
              Controlled external document delivery with bounded access, expiration, revocation, scan-gated serving,
              and a professional recipient experience.
            </Lead>
            <CTAGroup
              className="mt-8"
              actions={[
                { href: "/doclinks", label: "Learn about Doclinks", tone: "primary" },
                { href: "/trust", label: "Review security model", tone: "secondary" },
              ]}
            />
          </PremiumCard>

          <PremiumCard>
            <DocumentVisual
              rows={[
                { label: "Serve path", value: "Tokenized access", tone: "accent" },
                { label: "Exposure", value: "Expiration and revocation", tone: "neutral" },
                { label: "Recipient UX", value: "Professional delivery flow", tone: "warm" },
              ]}
              footer="Doclinks leads the portfolio today and sets the standard future products inherit."
            />
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Three principles"
          title="A public site built around three signals."
          body="The clearest cyang.io story is structural: control, auditability, and operational discipline."
        />
        <div className="mt-8">
          <PrinciplesGrid items={PRINCIPLES} />
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Product studio"
          title="Broader than one product. Focused enough to stay sharp."
          body="Doclinks is the lead product, but the foundation is intentionally built to support more systems without losing trust or clarity."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STUDIO_STRIP.map((item) => (
            <LinkTile key={item.href} href={item.href} title={item.title} body={item.body} meta={item.meta} badge={item.badge} />
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Proof architecture"
          title="Trust made visible as evidence."
          body="These are not footer leftovers. They are public proof that cyang.io operates like a serious software company."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PROOF_ITEMS.map((item) => (
            <LinkTile key={item.href} href={item.href} title={item.title} body={item.body} meta={item.meta} />
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch">
          <PremiumCard strong className="flex flex-col items-center justify-center text-center">
            <div className="grid h-28 w-28 place-items-center rounded-[2rem] border border-white/12 bg-white/[0.05] text-3xl font-semibold tracking-[0.08em] text-white">
              CY
            </div>
            <div className="mt-5 text-xl font-semibold text-white">Built by Chang Yang</div>
            <div className="mt-2 text-sm text-white/58">Founder-led. Product-minded. Systems disciplined.</div>
          </PremiumCard>

          <PremiumCard>
            <Eyebrow>Founder statement</Eyebrow>
            <Lead className="mt-4 max-w-2xl">
              cyang.io is built as a long-term home for practical software: quieter than hype, stricter where it
              matters, and clear enough for customers to trust quickly.
            </Lead>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <PremiumCard className="p-5">
                <div className="text-sm font-semibold text-white">Practical software</div>
                <div className="mt-2 text-sm text-white/60">Real workflows first. No filler.</div>
              </PremiumCard>
              <PremiumCard className="p-5">
                <div className="text-sm font-semibold text-white">Architecture-level controls</div>
                <div className="mt-2 text-sm text-white/60">Important rules stay enforced by the system.</div>
              </PremiumCard>
              <PremiumCard className="p-5">
                <div className="text-sm font-semibold text-white">Long-term stewardship</div>
                <div className="mt-2 text-sm text-white/60">Products are meant to stay coherent as they grow.</div>
              </PremiumCard>
            </div>
            <CTAGroup className="mt-8" actions={[{ href: "/about", label: "About cyang.io", tone: "secondary" }]} />
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <PremiumCard strong className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Eyebrow>Conversion rail</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Start with the flagship or explore the wider portfolio.
            </h2>
            <Lead className="mt-4 max-w-2xl">
              The site is structured so customers, buyers, and future partners can move quickly without losing context.
            </Lead>
          </div>
          <CTAGroup
            actions={[
              { href: "/doclinks", label: "Explore Doclinks", tone: "primary" },
              { href: "/products", label: "Explore the portfolio", tone: "secondary" },
              { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Get started" : "Sign in", tone: "secondary" },
            ]}
          />
        </PremiumCard>
      </Section>
    </SiteShell>
  );
}
