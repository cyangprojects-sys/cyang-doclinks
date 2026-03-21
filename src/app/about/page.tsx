import type { Metadata } from "next";
import { ScrollRevealFrame } from "@/app/components/CinematicClient";
import { AmbientScene, SectionTransition, StoryBand, VisualSignalCluster } from "@/app/components/CinematicScene";
import {
  CTAGroup,
  ContentRail,
  Eyebrow,
  MaturityBadge,
  PremiumCard,
  Section,
} from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";

export const metadata: Metadata = {
  title: "About - cyang.io",
  description:
    "cyang.io builds practical software with disciplined product thinking, clear trust surfaces, and long-term technical stewardship.",
};

const PRINCIPLES = [
  "Practical software over hype",
  "Architecture-level controls",
  "Long-term stewardship",
  "Calm execution",
  "Customer clarity",
];

const ROADMAP = [
  {
    title: "Flagship products",
    body: "Doclinks sets the benchmark: controlled delivery, visible posture, and a product surface that rewards precision.",
    tone: "live" as const,
  },
  {
    title: "Trust systems",
    body: "The public shell, policy surfaces, procurement materials, and operational signals are treated as product work.",
    tone: "build" as const,
  },
  {
    title: "Adjacent workflow tools",
    body: "Future products will stay close to workflow integrity, operational clarity, and high-trust external delivery.",
    tone: "lab" as const,
  },
];

export default function AboutPage() {
  return (
    <SiteShell maxWidth="full">
      <section className="cinematic-bleed relative overflow-hidden pt-10 sm:pt-16 lg:pt-20">
        <AmbientScene tone="steel" className="opacity-90" />
        <ContentRail className="relative">
          <div className="grid gap-8 lg:grid-cols-[minmax(260px,0.6fr)_minmax(0,1.15fr)] lg:items-end">
            <ScrollRevealFrame>
              <div className="floating-stage relative min-h-[320px] overflow-hidden rounded-sm p-8 sm:p-10">
                <AmbientScene tone="cool" className="opacity-75" />
                <div className="relative flex h-full flex-col justify-between">
                  <Eyebrow className="self-start">Company</Eyebrow>
                  <div className="editorial-kicker">CY</div>
                  <div className="max-w-xs text-sm leading-7 text-[var(--text-muted)]">
                    Product work, trust systems, and a quieter standard for how secure workflow software should feel.
                  </div>
                </div>
              </div>
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120}>
              <div className="max-w-4xl pb-2">
                <Eyebrow>About cyang.io</Eyebrow>
                <h1 className="mt-6 max-w-4xl text-balance font-editorial text-5xl leading-[0.95] tracking-[-0.05em] text-slate-950 sm:text-6xl lg:text-[5.6rem]">
                  A disciplined home for practical software.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  cyang.io builds products that make control, reviewability, and operational clarity feel native instead
                  of bolted on afterward.
                </p>
                <CTAGroup
                  className="mt-8"
                  actions={[
                    { href: "/products", label: "Explore products", tone: "primary" },
                    { href: "/contact", label: "Contact", tone: "secondary" },
                  ]}
                />
              </div>
            </ScrollRevealFrame>
          </div>
        </ContentRail>
      </section>

      <SectionTransition label="Manifesto" />

      <Section className="pt-4 sm:pt-8">
        <ScrollRevealFrame>
          <StoryBand
            eyebrow="What cyang.io is"
            title="A product studio built around control surfaces, clear systems, and software that ages well."
            body="The company is intentionally narrow in taste and broad in discipline. Products need to solve a real workflow problem, carry their trust posture in public, and remain understandable long after launch."
            aside={
              <VisualSignalCluster
                title="Studio focus"
                items={[
                  { label: "Products", value: "Flagship tools with opinionated workflow controls." },
                  { label: "Systems", value: "Public trust, legal, and operational layers treated as first-class product surfaces." },
                  { label: "Engineering", value: "Security-aware implementation that stays calm under scrutiny." },
                ]}
              />
            }
          />
        </ScrollRevealFrame>
      </Section>

      <Section className="py-16 sm:py-20">
        <ScrollRevealFrame>
          <div className="floating-stage relative overflow-hidden rounded-sm px-6 py-10 sm:px-8 sm:py-14 lg:px-12">
            <AmbientScene tone="signal" className="opacity-85" />
            <div className="relative grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div className="max-w-2xl">
                <Eyebrow>Operating principles</Eyebrow>
                <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                  Calm execution backed by hard edges where they matter.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  The posture is simple: avoid noise, make the important controls explicit, and keep the product honest
                  enough to withstand real review.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {PRINCIPLES.map((principle, index) => (
                  <PremiumCard key={principle} className="min-h-[168px] bg-white/90">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-8 text-xl font-semibold tracking-tight text-slate-950">{principle}</div>
                  </PremiumCard>
                ))}
              </div>
            </div>
          </div>
        </ScrollRevealFrame>
      </Section>

      <SectionTransition label="Founder" />

      <Section className="pt-4 sm:pt-8">
        <ScrollRevealFrame>
          <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.62fr)_minmax(0,1fr)] lg:items-center">
            <div className="floating-stage relative min-h-[360px] overflow-hidden rounded-sm p-8">
              <AmbientScene tone="steel" className="opacity-80" />
              <div className="relative flex h-full flex-col justify-between">
                <Eyebrow className="self-start">Built by Chang Yang</Eyebrow>
                <div className="editorial-kicker text-[clamp(5rem,12vw,8.5rem)]">CY</div>
                <div className="max-w-xs text-sm leading-7 text-[var(--text-muted)]">
                  Founder-led product work with taste for restraint, trust architecture, and software that earns review.
                </div>
              </div>
            </div>

            <div className="max-w-3xl">
              <div className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-faint)]">Founder statement</div>
              <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                Build fewer things. Make them sharper, steadier, and easier to trust.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                cyang.io was built to house products that feel composed under pressure. That means customer-facing
                controls, legible policy surfaces, and design decisions that support credibility instead of competing
                with it.
              </p>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-muted)]">
                The goal is not a sprawling product catalog. It is a durable portfolio of practical systems that solve
                meaningful workflow problems and present themselves with confidence.
              </p>
            </div>
          </div>
        </ScrollRevealFrame>
      </Section>

      <SectionTransition label="Future direction" />

      <Section className="pt-4 sm:pt-8">
        <ScrollRevealFrame>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
            <div className="max-w-2xl">
              <Eyebrow>Roadmap</Eyebrow>
              <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                A focused path, not a sprawling menu.
              </h2>
              <p className="mt-5 text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                Growth will stay close to the company&apos;s center of gravity: secure delivery, trust infrastructure,
                and workflow tools that benefit from tighter operational discipline.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {ROADMAP.map((item) => (
                <PremiumCard key={item.title} className="h-full">
                  <MaturityBadge tone={item.tone}>
                    {item.tone === "live" ? "Live now" : item.tone === "build" ? "In development" : "Systems lab"}
                  </MaturityBadge>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{item.body}</p>
                </PremiumCard>
              ))}
            </div>
          </div>
        </ScrollRevealFrame>
      </Section>

      <Section className="pb-18 pt-16 sm:pb-24 sm:pt-20">
        <ScrollRevealFrame>
          <div className="floating-stage relative overflow-hidden rounded-sm px-6 py-10 sm:px-8 sm:py-14 lg:px-12">
            <AmbientScene tone="cool" className="opacity-85" />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="max-w-3xl">
                <Eyebrow>Next step</Eyebrow>
                <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                  Explore the portfolio or start a direct conversation.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--text-secondary)] sm:text-lg">
                  The public site is designed to make the company legible quickly. The next move depends on whether
                  you want product detail, trust detail, or a conversation.
                </p>
              </div>
              <CTAGroup
                actions={[
                  { href: "/products", label: "Explore products", tone: "primary" },
                  { href: "/contact", label: "Contact", tone: "secondary" },
                ]}
              />
            </div>
          </div>
        </ScrollRevealFrame>
      </Section>
    </SiteShell>
  );
}
