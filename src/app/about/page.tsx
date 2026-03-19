import type { Metadata } from "next";
import {
  CTAGroup,
  Eyebrow,
  Lead,
  MaturityBadge,
  PremiumCard,
  PrinciplesGrid,
  Section,
  SectionHeader,
} from "../components/PublicPrimitives";
import { SiteShell } from "../components/SiteShell";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "About - cyang.io",
  description:
    "A disciplined home for practical software: founder-led products, systems thinking, and security-conscious engineering by cyang.io.",
};

const WHAT_IS = [
  {
    title: "Products",
    body: "Software with a clear operating job, flagship-level focus, and room to mature without sprawl.",
    microcopy: "Built to stay useful.",
  },
  {
    title: "Systems",
    body: "Operational layers for trust, governance, and public clarity that support the products around them.",
    microcopy: "Structure matters.",
  },
  {
    title: "Security-first engineering",
    body: "Important controls live in architecture and policy, not as optional afterthoughts.",
    microcopy: "Boundaries stay enforceable.",
  },
];

const PRINCIPLES = [
  { title: "Practical software over hype", body: "The point is durable usefulness, not noise.", microcopy: "Signal before spectacle." },
  { title: "Architecture-level controls", body: "Critical rules are enforced by the system.", microcopy: "Policy holds under pressure." },
  { title: "Long-term stewardship", body: "Products are built to remain coherent as they grow.", microcopy: "Steady, not frantic." },
  { title: "Calm execution", body: "A tighter roadmap leaves more room for quality.", microcopy: "Discipline compounds." },
  { title: "Customer clarity", body: "People should understand what the system does and what it does not.", microcopy: "Readable by design." },
];

const ROADMAP = [
  { title: "Flagship products", body: "Doclinks leads today, with future products earning their place through the same standard.", tone: "live" as const },
  { title: "Trust systems", body: "Public status, policy, legal, and procurement pathways continue to tighten as a unified shell.", tone: "build" as const },
  { title: "Adjacent workflow tools", body: "Expansion stays focused on practical, high-trust workflow software.", tone: "lab" as const },
];

export default function AboutPage() {
  return (
    <SiteShell maxWidth="full">
      <Section className="pt-8 sm:pt-12">
        <SectionHeader
          eyebrow="About cyang.io"
          title="A disciplined home for practical software."
          body="cyang.io is a founder-led product studio for secure workflows, operational clarity, and systems that stay legible as they grow."
        />
      </Section>

      <Section>
        <SectionHeader
          eyebrow="What cyang.io is"
          title="A portfolio built around products, systems, and engineering discipline."
          body="The company structure is simple on purpose: a flagship product, a visible trust architecture, and room for adjacent tools to emerge without clutter."
        />
        <div className="mt-8">
          <PrinciplesGrid items={WHAT_IS} />
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Operating principles"
          title="The working philosophy behind the site and the products."
          body="These are the standards that shape public copy, interface decisions, and product architecture."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PRINCIPLES.map((item) => (
            <PremiumCard key={item.title} className="h-full">
              <div className="text-2xl font-semibold tracking-tight text-white">{item.title}</div>
              <Lead className="mt-4 text-base">{item.body}</Lead>
              <div className="mt-6 text-xs uppercase tracking-[0.18em] text-white/38">{item.microcopy}</div>
            </PremiumCard>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <PremiumCard strong className="flex flex-col items-center justify-center text-center">
            <div className="grid h-28 w-28 place-items-center rounded-[2rem] border border-white/12 bg-white/[0.05] text-3xl font-semibold tracking-[0.08em] text-white">
              CY
            </div>
            <div className="mt-5 text-xl font-semibold text-white">Chang Yang</div>
            <div className="mt-2 text-sm text-white/58">Founder and builder</div>
          </PremiumCard>

          <PremiumCard>
            <Eyebrow>Founder band</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Building software that stays clear under operational pressure.
            </h2>
            <Lead className="mt-4 max-w-2xl">
              The cyang.io direction is deliberately narrow: build useful products, enforce important boundaries at the
              system layer, and make trust easy to review from the public site down.
            </Lead>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-white/64">
              Doclinks is the flagship proof of that approach. More products can grow from this foundation, but only if
              the site, the trust posture, and the product system remain coherent.
            </p>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Future direction"
          title="A high-level roadmap with room to stay disciplined."
          body="The next stage is not about breadth for its own sake. It is about extending a strong foundation into adjacent practical tools."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {ROADMAP.map((item) => (
            <PremiumCard key={item.title} className="h-full">
              <div className="flex items-center justify-between gap-4">
                <div className="text-xl font-semibold text-white">{item.title}</div>
                <MaturityBadge tone={item.tone}>{item.tone === "live" ? "Active" : item.tone === "build" ? "Growing" : "Future"}</MaturityBadge>
              </div>
              <Lead className="mt-4 text-base">{item.body}</Lead>
            </PremiumCard>
          ))}
        </div>
      </Section>

      <Section>
        <PremiumCard strong className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Explore the portfolio or get in touch.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/66">
              The public site is built to make the structure clear quickly: flagship product, trust-first platform, and
              a company that intends to keep both coherent.
            </p>
          </div>
          <CTAGroup
            actions={[
              { href: "/products", label: "Explore products", tone: "primary" },
              { href: "/contact", label: "Contact", tone: "secondary" },
            ]}
          />
        </PremiumCard>
      </Section>
    </SiteShell>
  );
}
