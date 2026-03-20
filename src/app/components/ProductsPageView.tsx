import { ScrollRevealFrame } from "./CinematicClient";
import { AmbientScene, SectionTransition, StoryBand, VisualSignalCluster } from "./CinematicScene";
import {
  CTAGroup,
  ContentRail,
  Eyebrow,
  LinkTile,
  MaturityBadge,
  PremiumCard,
  Section,
} from "./PublicPrimitives";

type ProductItem = {
  title: string;
  href: string;
  status: string;
  tone: "live" | "build" | "lab";
  audience: string;
  outcome: string;
  cta: string;
};

const LIVE_NOW: ProductItem[] = [
  {
    title: "Doclinks",
    href: "/doclinks",
    status: "Live now",
    tone: "live",
    audience: "Operations teams, compliance workflows, small businesses",
    outcome: "Controlled external document delivery with serve-time controls and reviewable trust surfaces.",
    cta: "Explore Doclinks",
  },
];

const IN_DEVELOPMENT: ProductItem[] = [
  {
    title: "Trust Systems",
    href: "/trust",
    status: "In development",
    tone: "build",
    audience: "Buyers, security reviewers, procurement teams",
    outcome: "A tighter review path for policy, status, procurement, and security posture.",
    cta: "Review trust architecture",
  },
  {
    title: "Operational Signals",
    href: "/status",
    status: "In development",
    tone: "build",
    audience: "Customers and internal operators",
    outcome: "Public reliability surfaces that make system posture legible instead of noisy.",
    cta: "View status",
  },
];

const SYSTEMS_LAB: ProductItem[] = [
  {
    title: "Systems Lab",
    href: "/about",
    status: "Systems and experiments",
    tone: "lab",
    audience: "Future workflow products and internal operations",
    outcome: "A future-facing lane for adjacent workflow tools that can inherit the same discipline.",
    cta: "See the roadmap",
  },
];

function ProductCard({ item }: { item: ProductItem }) {
  return (
    <LinkTile
      href={item.href}
      title={item.title}
      body={item.outcome}
      meta={item.audience}
      badge={<MaturityBadge tone={item.tone}>{item.status}</MaturityBadge>}
      ctaLabel={item.cta}
      className="h-full"
    />
  );
}

export function ProductsPageView() {
  return (
    <>
      <Section className="pt-10 sm:pt-14">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div className="max-w-4xl">
                <Eyebrow>Product studio</Eyebrow>
                <h1 className="mt-6 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-7xl">
                  Products and systems built with discipline.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-white/64 sm:text-lg">
                  cyang.io is structured around one flagship today and a clean foundation for what comes next.
                </p>
                <CTAGroup
                  className="mt-8"
                  actions={[
                    { href: "/doclinks", label: "Explore Doclinks", tone: "primary" },
                    { href: "/trust", label: "Review Trust", tone: "secondary" },
                  ]}
                />
              </div>

              <div className="floating-stage p-6 sm:p-7">
                <AmbientScene tone="signal" className="opacity-70" />
                <VisualSignalCluster
                  title="Portfolio posture"
                  items={[
                    { label: "Flagship", value: "Doclinks is the lead public product." },
                    { label: "Growth model", value: "Expansion stays focused rather than sprawling." },
                    { label: "Inheritance", value: "New products carry the same trust posture." },
                  ]}
                />
              </div>
            </div>
          </ScrollRevealFrame>
        </ContentRail>
      </Section>

      <SectionTransition label="Portfolio lanes" />

      <Section className="py-20 sm:py-24">
        <ContentRail className="space-y-12">
          <ScrollRevealFrame>
            <StoryBand
              eyebrow="Live now"
              title="A studio portfolio staged around one live flagship."
              body="The cyang.io growth model is intentional: ship the lead product, harden the supporting trust systems, then expand only where the quality bar stays intact."
              aside={
                <div className="floating-stage p-5 sm:p-6">
                  <VisualSignalCluster
                    title="Product maturity"
                    items={[
                      { label: "Live now", value: "Customer-facing flagship" },
                      { label: "In development", value: "Trust and signal systems" },
                      { label: "Lab", value: "Adjacent workflow explorations" },
                    ]}
                  />
                </div>
              }
            />
          </ScrollRevealFrame>

          <div className="space-y-10">
            <div>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h3 className="text-xl font-semibold text-white">Live now</h3>
                <MaturityBadge tone="live">Customer-facing</MaturityBadge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">{LIVE_NOW.map((item) => <ProductCard key={item.title} item={item} />)}</div>
            </div>

            <div>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h3 className="text-xl font-semibold text-white">In development</h3>
                <MaturityBadge tone="build">Actively shaping</MaturityBadge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">{IN_DEVELOPMENT.map((item) => <ProductCard key={item.title} item={item} />)}</div>
            </div>

            <div>
              <div className="mb-5 flex items-center justify-between gap-4">
                <h3 className="text-xl font-semibold text-white">Systems and experiments</h3>
                <MaturityBadge tone="lab">Exploratory</MaturityBadge>
              </div>
              <div className="grid gap-4 md:grid-cols-2">{SYSTEMS_LAB.map((item) => <ProductCard key={item.title} item={item} />)}</div>
            </div>
          </div>
        </ContentRail>
      </Section>

      <SectionTransition label="Studio philosophy" />

      <Section className="py-20 sm:py-24">
        <ContentRail className="space-y-10">
          <ScrollRevealFrame>
            <div className="floating-stage overflow-hidden p-6 sm:p-8 lg:p-10">
              <AmbientScene tone="cool" className="opacity-75" />
              <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Product philosophy</div>
                  <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                    Practical software. Long-term stewardship. Policy where it matters.
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <PremiumCard className="p-5">
                    <div className="text-sm font-semibold text-white">Clarity over clutter</div>
                    <p className="mt-3 text-sm leading-7 text-white/62">Every public page and product surface should answer one question well.</p>
                  </PremiumCard>
                  <PremiumCard className="p-5">
                    <div className="text-sm font-semibold text-white">Controlled growth</div>
                    <p className="mt-3 text-sm leading-7 text-white/62">New work inherits the same trust posture as the flagship instead of improvising later.</p>
                  </PremiumCard>
                </div>
              </div>
            </div>
          </ScrollRevealFrame>

          <ScrollRevealFrame delay={120}>
            <div className="floating-stage p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Trust continuity</div>
                  <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                    The same trust posture carries across the portfolio.
                  </h2>
                  <p className="mt-5 text-base leading-8 text-white/64 sm:text-lg">
                    Status, legal, disclosure routes, and procurement readiness are part of the public product system rather than optional side channels.
                  </p>
                </div>
                <CTAGroup
                  actions={[
                    { href: "/trust", label: "Review Trust", tone: "primary" },
                    { href: "/contact", label: "Contact", tone: "secondary" },
                  ]}
                />
              </div>
            </div>
          </ScrollRevealFrame>
        </ContentRail>
      </Section>
    </>
  );
}
