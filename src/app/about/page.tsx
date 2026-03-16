import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";
import { getBillingFlags } from "@/lib/settings";

export const metadata: Metadata = {
  title: "About - cyang.io",
  description:
    "About cyang.io and Chang Yang: founder-led, security-first product systems with enforced controls, operational clarity, and customer-ready software.",
};

type Item = {
  title: string;
  body: string;
};

type FocusItem = {
  title: string;
  status: "Live" | "Shipping" | "Hardening";
  body: string;
};

const HERO_CHIPS = [
  "Security-first architecture",
  "Enforcement in code",
  "Operational clarity",
  "Audit-minded systems",
];

const WHAT_IS_ITEMS: Item[] = [
  {
    title: "Product studio",
    body: "cyang.io is a focused portfolio of products and systems built for practical, real-world workflows.",
  },
  {
    title: "Build surface",
    body: "It is where new software is designed, pressure-tested, and hardened for customer trust.",
  },
  {
    title: "Portfolio strategy",
    body: "Doclinks is the first flagship product, with additional systems expanding from the same standards.",
  },
];

const BUILD_PRINCIPLES: Item[] = [
  {
    title: "Enforce policy server-side",
    body: "Access decisions and lifecycle controls are enforced by architecture, not left to client behavior.",
  },
  {
    title: "Encrypt by default",
    body: "Sensitive data paths are protected by default rather than treated as optional configuration.",
  },
  {
    title: "Block risky delivery states",
    body: "Failed, infected, and quarantined states are blocked from external delivery.",
  },
  {
    title: "Make operations reviewable",
    body: "Systems are designed with clear states, deterministic policy behavior, and auditable event trails.",
  },
];

const OPTIMIZE_FOR: Item[] = [
  {
    title: "Access boundaries",
    body: "Reliable control over who can access what, when, and under which policy rules.",
  },
  {
    title: "Visibility without leakage",
    body: "Operational visibility should help teams review behavior without exposing sensitive data unnecessarily.",
  },
  {
    title: "Fast, predictable UX",
    body: "Security controls and usability should work together, not force tradeoffs in daily workflows.",
  },
  {
    title: "Auditability and recovery",
    body: "Systems should be straightforward to review, troubleshoot, and recover under pressure.",
  },
];

const CURRENT_FOCUS: FocusItem[] = [
  {
    title: "Doclinks",
    status: "Live",
    body: "Scaling controlled external document delivery with stronger policy clarity and conversion paths.",
  },
  {
    title: "Upload hardening",
    status: "Hardening",
    body: "Tightening file validation and delivery guardrails so risky states never become accidental exposure.",
  },
  {
    title: "Operations and observability",
    status: "Shipping",
    body: "Improving governance and operational visibility to keep security posture clear and manageable.",
  },
];

const ENFORCEMENTS: Item[] = [
  {
    title: "No unencrypted serve path",
    body: "Public delivery does not bypass encrypted handling paths.",
  },
  {
    title: "Blocked risky file states",
    body: "Failed, infected, or quarantined files are blocked from delivery.",
  },
  {
    title: "Server-side plan limits",
    body: "Usage boundaries are enforced by the backend rather than UI hints.",
  },
  {
    title: "Rate limits and abuse protection",
    body: "Upload and access paths are guarded to reduce misuse and brute-force behavior.",
  },
];

export default async function AboutPage() {
  const flagsRes = await getBillingFlags();
  const showPricingUi = flagsRes.flags.pricingUiEnabled;

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/12 blur-3xl" />
        </div>

        <div className="lg:col-span-7">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">About cyang.io</span>
          <h1 className="font-editorial mt-5 max-w-4xl text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Founder-led systems and products
            <span className="block text-white/72">built for trust under real usage.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            I am Chang Yang. cyang.io is my product studio for security-first software and operational systems.
            The goal is simple: build useful products with strict defaults, clear control surfaces, and dependable user experience.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {HERO_CHIPS.map((chip) => (
              <span key={chip} className="ui-badge rounded-full px-3 py-1.5 text-xs">
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/projects" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Explore projects
            </Link>
            <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              See Doclinks
            </Link>
            <Link href="/report" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Get in touch
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Founder snapshot</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Chang Yang</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Building with a high-conviction standard: if controls are critical, they should be enforced in code.
            </p>

            <div className="mt-5 space-y-3">
              <StackCard title="Secure delivery" body="Policy-enforced access paths, not trust-by-URL." />
              <StackCard title="Operational controls" body="Clear limits, deterministic states, and audit-minded workflows." />
              <StackCard title="Product quality" body="Fast UX, practical defaults, and maintainable architecture." />
            </div>
          </div>
        </div>
      </section>

      <section id="what-is" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="What cyang.io is"
          title="A focused studio for serious product systems"
          body="cyang.io is a portfolio and build surface for practical software. It is intentionally compact, actively maintained, and designed to scale quality before scope."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {WHAT_IS_ITEMS.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section id="why-exists" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Why this exists"
          title="A response to weak defaults around sensitive sharing"
          body="Sensitive documents are often shared in workflows that assume good behavior instead of enforcing safe behavior. cyang.io exists to replace that fragility with deliberate system controls."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <div className="glass-card rounded-3xl p-6 lg:col-span-7">
            <h3 className="text-lg font-semibold tracking-tight text-white">Founder rationale</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              I kept seeing critical files handled with broad-access links, unclear ownership, and limited accountability.
              That pattern is fast in the short term, but risky in the long term.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              cyang.io is built around a different posture: enforce policy at the system layer, keep operation legible,
              and give teams practical tools that still feel fast and human.
            </p>
          </div>

          <div className="glass-card-strong rounded-3xl p-6 lg:col-span-5">
            <h3 className="text-lg font-semibold tracking-tight text-white">Design response</h3>
            <ul className="mt-4 space-y-2">
              <Bullet>Security defaults are non-negotiable.</Bullet>
              <Bullet>Ambiguous features ship with guardrails or do not ship.</Bullet>
              <Bullet>Operational clarity is treated as a product requirement.</Bullet>
              <Bullet>Trust is built through deterministic behavior, not claims.</Bullet>
            </ul>
          </div>
        </div>
      </section>

      <section id="how-i-build" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="How I build"
          title="Core engineering principles"
          body="These principles are applied in production decisions, not kept as abstract guidelines."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUILD_PRINCIPLES.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section id="optimize-for" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="What I optimize for"
          title="Product priorities that affect customers directly"
          body="Every architecture decision is evaluated against operational reliability and day-to-day user outcomes."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {OPTIMIZE_FOR.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section id="current-focus" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Current focus"
          title="What is actively being built"
          body="The current roadmap is compact and deliberate, with Doclinks as the flagship proof of the cyang.io build philosophy."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {CURRENT_FOCUS.map((item) => (
            <FocusCard key={item.title} title={item.title} status={item.status} body={item.body} />
          ))}
        </div>
      </section>

      <section id="enforced-controls" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="What this platform enforces"
          title="Production controls that build trust"
          body="These are active controls in the product, designed to reduce risk and make behavior predictable."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {ENFORCEMENTS.map((item) => (
            <ControlCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section id="flagship" className="mt-16 md:mt-20">
        <div className="glass-card-strong ui-enterprise-grid rounded-3xl p-7 sm:p-8">
          <SectionIntro
            eyebrow="Flagship project"
            title="Doclinks is the clearest example of this build standard"
            body="Doclinks puts the cyang.io philosophy into production: controlled external delivery, policy enforcement, audit visibility, and practical UX."
          />

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniPill label="Controlled sharing" />
            <MiniPill label="Server-side policy checks" />
            <MiniPill label="Scan-gated delivery" />
            <MiniPill label="Audit-minded workflow" />
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/projects/doclinks" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Explore Doclinks
            </Link>
            <Link href="/projects" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Browse all projects
            </Link>
          </div>
        </div>
      </section>

      <section id="built-deliberately" className="mt-16 md:mt-20">
        <div className="glass-card rounded-3xl p-7">
          <SectionIntro
            eyebrow="Built deliberately"
            title="Clear systems, enforceable policy, and no ambiguous defaults"
            body="If a feature changes risk posture, it should be explicit, reviewable, and bounded by guardrails. That standard is how cyang.io products are designed and shipped."
          />
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card-strong ui-sheen rounded-3xl p-7 sm:p-8">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Explore what cyang.io is building</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72">
            Start with the project portfolio, review the Doclinks flagship, and follow the same standards through pricing and support paths.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CtaTile href="/projects" title="Browse projects" body="See the current studio portfolio." />
            <CtaTile href="/projects/doclinks" title="Explore Doclinks" body="Review the flagship product in depth." />
            {showPricingUi ? (
              <CtaTile href="/pricing" title="View pricing" body="Compare plans and capability levels." />
            ) : (
              <CtaTile href="/status" title="View status" body="Check service health and operations." />
            )}
            <CtaTile href="/report" title="Get in touch" body="Contact for questions or reporting." />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function SectionIntro(props: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-4xl">
      <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em]">{props.eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{props.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/72 sm:text-base">{props.body}</p>
    </div>
  );
}

function StackCard(props: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
      <div className="text-xs uppercase tracking-[0.1em] text-white/55">{props.title}</div>
      <div className="mt-1 text-sm text-white/82">{props.body}</div>
    </div>
  );
}

function FeatureCard(props: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-relaxed text-white/70">
      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
      <span>{children}</span>
    </li>
  );
}

function FocusCard(props: { title: string; status: FocusItem["status"]; body: string }) {
  const statusTone: Record<FocusItem["status"], string> = {
    Live: "border-emerald-200/30 bg-emerald-300/10 text-emerald-100",
    Shipping: "border-sky-200/30 bg-sky-300/10 text-sky-100",
    Hardening: "border-amber-200/30 bg-amber-300/10 text-amber-100",
  };

  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone[props.status]}`}>
          {props.status}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/70">{props.body}</p>
    </div>
  );
}

function ControlCard(props: { title: string; body: string }) {
  return (
    <div className="glass-card-strong rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </div>
  );
}

function MiniPill({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm font-medium text-white/90">
      {label}
    </div>
  );
}

function CtaTile(props: { href: string; title: string; body: string }) {
  return (
    <Link href={props.href} className="rounded-2xl border border-white/14 bg-white/8 p-4 transition-colors hover:bg-white/14">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-white/67">{props.body}</p>
    </Link>
  );
}
