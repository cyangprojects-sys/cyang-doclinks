import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "./components/SiteShell";
import { getBillingFlags } from "@/lib/settings";
import { isSignupEnabled } from "@/lib/signup";

export const metadata: Metadata = {
  title: "cyang.io - Systems, Products, and Secure Delivery",
  description:
    "cyang.io builds disciplined, security-first products and operational systems. Doclinks is the featured flagship for controlled document delivery.",
};

export default async function HomePage() {
  const flagsRes = await getBillingFlags();
  const showPricingUi = flagsRes.flags.pricingUiEnabled;
  const signupEnabled = isSignupEnabled();
  const primaryAccessHref = signupEnabled ? "/signup" : "/signin?intent=admin";

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-64 w-64 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-72 w-72 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-7">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            cyang.io - disciplined systems and products
          </span>
          <h1 className="font-editorial mt-5 max-w-4xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Built for teams that need software to stay
            <span className="block text-white/72">clear, controlled, and dependable.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-relaxed text-white/72">
            cyang.io builds practical software for secure workflows, controlled sharing, and operational clarity.
            Doclinks is the current flagship product, purpose-built for controlled document delivery.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200/25 bg-sky-300/8 px-3 py-1.5 text-xs text-sky-100/85">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />
            Featured Product: Doclinks
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/projects/doclinks" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Explore Doclinks
            </Link>
            <Link href="/projects" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm font-medium">
              View Projects
            </Link>
            <Link href="/about" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
              About cyang.io
            </Link>
            <Link
              href="/trust"
              className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm"
            >
              Review trust
            </Link>
          </div>

          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            <HeroSignal title="Studio posture" value="Security-first by architecture" />
            <HeroSignal title="Current flagship" value="Doclinks" />
            <HeroSignal title="Operating style" value="Small surface area. High trust." />
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="glass-card-strong ui-sheen rounded-3xl p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.14em] text-white/55">Featured Product</div>
              <span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-2.5 py-1 text-[11px] text-emerald-100/85">
                Live
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Doclinks</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/72">
              Controlled external document delivery with tokenized access, expiration controls, and audit visibility
              for operations and compliance-minded teams.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill>Tokenized access</Pill>
              <Pill>Expiring links</Pill>
              <Pill>Audit trail</Pill>
              <Pill>Scan-gated delivery</Pill>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm">
                Product overview
              </Link>
              <Link href={primaryAccessHref} className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm">
                {signupEnabled ? "Get started" : "Sign in"}
              </Link>
            </div>
          </div>

          <div className="glass-card mt-4 rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Studio Map</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <StudioNode title="Products" body="Customer-facing software with clear value and controlled UX." />
              <StudioNode title="Systems" body="Operational tooling for policy, audit, and process integrity." />
              <StudioNode title="Security" body="Controls enforced at serve-time, not left to good intentions." />
              <StudioNode title="Roadmap" body="Disciplined expansion into adjacent practical workflows." />
            </div>
          </div>
        </div>
      </section>

      <section id="products" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="What cyang.io is"
          title="A focused software brand for products, systems, and practical security."
          body="cyang.io is not a single app. It is a disciplined home for tools that solve real operational problems with clean UX and enforced controls."
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <ValuePanel
            className="lg:col-span-5"
            title="Products"
            summary="Customer-ready software with clear jobs-to-be-done, intentional onboarding, and conversion-first flows."
            points={["Flagship launches with full lifecycle support", "Designed for real usage with long-term reliability"]}
          />
          <ValuePanel
            className="lg:col-span-3"
            title="Systems"
            summary="Internal and operational tools that support reliability, auditability, and maintenance."
            points={["Operations visibility", "Lifecycle automation"]}
          />
          <ValuePanel
            className="lg:col-span-4"
            title="Security-first engineering"
            summary="Risk controls are built in from day one: policy gates, rate limits, and deterministic serve paths."
            points={["Server-side enforcement", "Policy before convenience"]}
          />
          <ValuePanel
            className="lg:col-span-12"
            title="Practical tools"
            summary="Work that starts small, stays tight, and scales with intention."
            points={[
              "Every release balances clarity, speed, and trust",
              "Product decisions are driven by operating reality",
              "Each system is built for expansion without losing control",
            ]}
            horizontal
          />
        </div>
      </section>

      <section id="doclinks" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Featured Product"
          title="Doclinks: controlled delivery for sensitive documents."
          body="Doclinks gives teams a secure, customer-friendly way to send external files while keeping policy, access, and audit boundaries intact."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <div className="glass-card-strong rounded-3xl p-7 lg:col-span-7">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-white">Who it is for</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Operations teams, compliance workflows, and small businesses that handle sensitive external sharing.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-white">Core outcome</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Send critical files with control, confidence, and a clear audit record.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Capability title="Secure delivery" detail="Tokenized access paths with policy checks on every serve request." />
              <Capability title="Controlled exposure" detail="Expiration, view caps, and revocation reduce lingering risk." />
              <Capability title="Auditability" detail="Track access behavior for operational review and customer trust." />
              <Capability title="Guardrails first" detail="Blocked delivery when scan status is failed, infected, or quarantined." />
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/projects/doclinks" className="btn-base btn-primary rounded-xl px-5 py-3 text-sm font-semibold">
                Learn about Doclinks
              </Link>
              <Link href="/legal/security-policy" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                Review security model
              </Link>
              {showPricingUi ? (
                <Link href="/pricing" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                  See pricing
                </Link>
              ) : null}
            </div>
          </div>

          <div className="glass-card ui-enterprise-grid rounded-3xl p-6 lg:col-span-5">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Product Snapshot</div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Delivery workflow</h3>
            <div className="mt-5 space-y-3">
              <FlowStep
                index="01"
                title="Upload through secure paths"
                body="Validation, scanning, and storage controls apply before public access."
              />
              <FlowStep
                index="02"
                title="Set policy rules"
                body="Choose expiration, limits, and lifecycle controls for each link."
              />
              <FlowStep
                index="03"
                title="Share with confidence"
                body="Serve-time authorization and logging preserve control after sending."
              />
            </div>
            <div className="mt-6 rounded-2xl border border-white/12 bg-black/30 p-4 text-xs leading-relaxed text-white/60">
              Doclinks is the first flagship product under cyang.io, with additional systems and products expanding from
              the same discipline.
            </div>
          </div>
        </div>
      </section>

      <section id="ecosystem" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Ecosystem"
          title="A growing product and systems portfolio."
          body="Doclinks leads today, but cyang.io is intentionally broader. The ecosystem is designed to expand without becoming scattered."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <EcosystemLane
            className="lg:col-span-5"
            label="Featured now"
            title="Doclinks"
            description="Secure document delivery infrastructure with practical controls and customer-ready UX."
            items={["Security model and legal foundation in place", "Operational telemetry, limits, and lifecycle controls"]}
            href="/projects/doclinks"
            cta="Open product"
          />
          <EcosystemLane
            className="lg:col-span-4"
            label="Trust systems"
            title="Operations and governance layer"
            description="Policy, reliability, and trust surfaces that keep customer workflows consistent."
            items={["Security and legal trust architecture", "Status and reporting transparency"]}
            href="/trust"
            cta="Explore trust center"
          />
          <EcosystemLane
            className="lg:col-span-3"
            label="Systems lab"
            title="Practical experiments"
            description="Focused builds for reliability, workflow speed, and better product operations."
            items={["Automation helpers", "Quality-of-life tooling", "Future product probes"]}
            href="/projects"
            cta="Browse projects"
          />
        </div>
      </section>

      <section id="founder" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Founder"
          title="Built by Chang Yang"
          body="I build cyang.io as a long-term systems and products brand: practical software, clear controls, and trustworthy operations."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <div className="glass-card-strong rounded-3xl p-7 lg:col-span-4">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-sky-200/35 bg-gradient-to-br from-sky-300/30 to-teal-300/20 text-2xl font-semibold text-white shadow-[0_16px_40px_rgba(56,122,223,0.35)]">
              CY
            </div>
            <p className="mt-5 text-center text-sm leading-relaxed text-white/72">
              Disciplined builder, systems thinker, and security-first operator.
            </p>
            <div className="mt-5 grid gap-2">
              <FounderPill>Practical software over hype</FounderPill>
              <FounderPill>Architecture-level controls</FounderPill>
              <FounderPill>Long-term product stewardship</FounderPill>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-7 lg:col-span-8">
            <h3 className="text-xl font-semibold tracking-tight text-white">Founder statement</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              cyang.io exists to build useful systems that hold up under real operational pressure. I care about clean
              UX, strict controls where they matter, and products customers can trust quickly.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              The strategy is deliberate: ship focused products, support them deeply, and expand the ecosystem without
              losing clarity.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Principle title="Calm execution" desc="No chaos roadmaps. Tight priorities and reliable iteration." />
              <Principle title="Security posture" desc="Controls are enforced by design, not best-effort guidance." />
              <Principle title="Customer clarity" desc="Simple paths, clear expectations, and transparent boundaries." />
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/about" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                About cyang.io
              </Link>
              <Link href="/projects" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                Explore portfolio
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="trust" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Trust and proof"
          title="Built to be credible, reviewable, and operationally transparent."
          body="Trust is earned through controls, clear policies, and visible operating discipline."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <TrustCard
            className="lg:col-span-4"
            title="Security-minded by design"
            points={[
              "Server-side policy enforcement",
              "Scan-gated delivery controls",
              "Bounded access and lifecycle constraints",
            ]}
          />
          <TrustCard
            className="lg:col-span-4"
            title="Disciplined architecture"
            points={[
              "Small, auditable service surface",
              "Operational guardrails and limits",
              "Clear states and deterministic behavior",
            ]}
          />
          <TrustCard
            className="lg:col-span-4"
            title="Transparent operations"
            points={[
              "Public status visibility",
              "Legal and policy documentation",
              "Clear reporting and disclosure routes",
            ]}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <QuickTrustLink href="/status" label="Status Center" detail="Service health and operational updates." />
          <QuickTrustLink href="/trust" label="Trust Center" detail="Security, policy, reliability, and reporting links." />
          <QuickTrustLink href="/legal" label="Legal Center" detail="Terms, privacy, and policy documents." />
          <QuickTrustLink href="/data-retention" label="Data Retention" detail="Lifecycle and handling expectations." />
          <QuickTrustLink href="/security-disclosure" label="Security Disclosure" detail="How to report and coordinate findings." />
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card-strong ui-sheen rounded-3xl p-7 sm:p-8">
          <div className="max-w-3xl">
            <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
              Start here
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Choose your path through cyang.io.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/72">
              Explore the flagship product, discover the broader ecosystem, or get directly into the platform.
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FinalAction href="/projects/doclinks" label="Explore Doclinks" body="Start with the flagship product overview." />
            <FinalAction href="/projects" label="View all projects" body="See the expanding systems and products portfolio." />
            <FinalAction href="/about" label="Learn about cyang.io" body="Read founder direction and product approach." />
            <FinalAction
              href={primaryAccessHref}
              label={signupEnabled ? "Get started" : "Sign in"}
              body="Enter the platform and begin operating."
            />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function SectionHeader(props: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-4xl">
      <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em]">{props.eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{props.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/72 sm:text-base">{props.body}</p>
    </div>
  );
}

function HeroSignal(props: { title: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-[0.11em] text-white/55">{props.title}</div>
      <div className="mt-1.5 text-sm font-medium text-white/92">{props.value}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="ui-badge rounded-full px-2.5 py-1 text-xs">{children}</span>;
}

function StudioNode(props: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <div className="mt-1.5 text-xs leading-relaxed text-white/65">{props.body}</div>
    </div>
  );
}

function ValuePanel(props: {
  title: string;
  summary: string;
  points: string[];
  className?: string;
  horizontal?: boolean;
}) {
  return (
    <div className={`glass-card rounded-3xl p-6 ${props.className ?? ""}`}>
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.summary}</p>
      <ul className={`mt-4 ${props.horizontal ? "grid gap-2 md:grid-cols-3" : "space-y-2"}`}>
        {props.points.map((point) => (
          <li key={point} className="flex gap-2 text-xs leading-relaxed text-white/66">
            <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/65" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Capability(props: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 p-4">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/64">{props.detail}</div>
    </div>
  );
}

function FlowStep(props: { index: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-sky-200/30 bg-sky-300/10 px-2 py-1 text-[11px] text-sky-100/90">
          {props.index}
        </div>
        <div>
          <div className="text-sm font-medium text-white/90">{props.title}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/64">{props.body}</div>
        </div>
      </div>
    </div>
  );
}

function EcosystemLane(props: {
  label: string;
  title: string;
  description: string;
  items: string[];
  href: string;
  cta: string;
  className?: string;
}) {
  return (
    <Link href={props.href} className={`glass-card rounded-3xl p-6 transition-colors hover:bg-white/12 ${props.className ?? ""}`}>
      <div className="text-xs uppercase tracking-[0.14em] text-white/55">{props.label}</div>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.description}</p>
      <ul className="mt-4 space-y-2">
        {props.items.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-relaxed text-white/66">
            <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-teal-200/70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 text-sm text-white/85">{props.cta}</div>
    </Link>
  );
}

function FounderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-center text-xs text-white/74">
      {children}
    </span>
  );
}

function Principle(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 p-4">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/64">{props.desc}</div>
    </div>
  );
}

function TrustCard(props: { title: string; points: string[]; className?: string }) {
  return (
    <div className={`glass-card rounded-3xl p-6 ${props.className ?? ""}`}>
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <ul className="mt-4 space-y-2">
        {props.points.map((point) => (
          <li key={point} className="flex gap-2 text-xs leading-relaxed text-white/66">
            <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickTrustLink(props: { href: string; label: string; detail: string }) {
  return (
    <Link href={props.href} className="glass-card rounded-2xl p-4 transition-colors hover:bg-white/12">
      <div className="text-sm font-medium text-white/90">{props.label}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/64">{props.detail}</div>
    </Link>
  );
}

function FinalAction(props: { href: string; label: string; body: string }) {
  return (
    <Link href={props.href} className="rounded-2xl border border-white/14 bg-white/8 p-4 transition-colors hover:bg-white/14">
      <div className="text-sm font-medium text-white/93">{props.label}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/67">{props.body}</div>
    </Link>
  );
}
