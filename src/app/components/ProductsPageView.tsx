import {
  CTAGroup,
  Eyebrow,
  Lead,
  LinkTile,
  MaturityBadge,
  PageHero,
  PremiumCard,
  Section,
  SectionHeader,
  SignalCard,
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
    outcome: "Controlled external document delivery with serve-time controls and audit visibility.",
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
    outcome: "A tighter review path for policies, operational posture, and procurement readiness.",
    cta: "Review trust architecture",
  },
  {
    title: "Operational Signals",
    href: "/status",
    status: "In development",
    tone: "build",
    audience: "Customers and internal operators",
    outcome: "Clearer public reliability surfaces with disciplined escalation and status discoverability.",
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
    outcome: "A disciplined lane for testing adjacent workflow tools without diluting the flagship.",
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
      <PageHero
        eyebrow="Product studio"
        title="Products and systems built with discipline."
        body="cyang.io is structured around one flagship today and a clean foundation for what comes next."
        actions={[
          { href: "/doclinks", label: "Explore Doclinks", tone: "primary" },
          { href: "/trust", label: "Review Trust", tone: "secondary" },
        ]}
        aside={
          <PremiumCard strong>
            <Eyebrow>Portfolio posture</Eyebrow>
            <div className="mt-5 grid gap-3">
              <SignalCard label="Flagship" value="Doclinks" detail="The clearest expression of the cyang.io product standard." />
              <SignalCard label="Growth model" value="Focused expansion" detail="New systems only earn their place when the operating posture stays clear." />
            </div>
          </PremiumCard>
        }
      />

      <Section>
        <SectionHeader
          eyebrow="Maturity grid"
          title="A studio portfolio with room to grow."
          body="The structure is deliberate: one live flagship, adjacent trust systems in development, and a systems lab for future workflow products."
        />

        <div className="mt-8 space-y-10">
          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-white">Live now</h3>
              <MaturityBadge tone="live">Customer-facing</MaturityBadge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">{LIVE_NOW.map((item) => <ProductCard key={item.title} item={item} />)}</div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-white">In development</h3>
              <MaturityBadge tone="build">Actively shaping</MaturityBadge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">{IN_DEVELOPMENT.map((item) => <ProductCard key={item.title} item={item} />)}</div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold text-white">Systems and experiments</h3>
              <MaturityBadge tone="lab">Exploratory</MaturityBadge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">{SYSTEMS_LAB.map((item) => <ProductCard key={item.title} item={item} />)}</div>
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-4 lg:grid-cols-12">
          <PremiumCard strong className="lg:col-span-7">
            <Eyebrow>Product philosophy</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Practical software. Long-term stewardship. Policy where it matters.
            </h2>
            <Lead className="mt-4 max-w-2xl">
              cyang.io products are designed to stay legible under real use: clear outcomes, minimal clutter, and
              operational boundaries that do not disappear after launch.
            </Lead>
          </PremiumCard>

          <PremiumCard className="lg:col-span-5">
            <div className="grid gap-4">
              <SignalCard label="Priority" value="Clarity over clutter" detail="Every public page and product surface should answer one question well." />
              <SignalCard label="Quality bar" value="Controlled growth" detail="New work inherits the same trust posture as the flagship." />
            </div>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <PremiumCard className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Eyebrow>Trust continuity</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              The same trust posture carries across the portfolio.
            </h2>
            <Lead className="mt-4 max-w-2xl">
              Status, legal surfaces, disclosure routes, and procurement readiness are not add-ons. They are part of
              the public product system.
            </Lead>
          </div>

          <CTAGroup
            actions={[
              { href: "/trust", label: "Review Trust", tone: "primary" },
              { href: "/contact", label: "Contact", tone: "secondary" },
            ]}
          />
        </PremiumCard>
      </Section>
    </>
  );
}
