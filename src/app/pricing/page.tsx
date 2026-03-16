import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "../components/SiteShell";
import { getBillingFlags } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pricing - Doclinks",
  description:
    "Transparent Free and Pro pricing for Doclinks secure document delivery. Security defaults included, clear limits, and upgrade paths for higher-throughput teams.",
};

type PlanFeature = {
  feature: string;
  free: string;
  pro: string;
};

type ComparisonGroup = {
  title: string;
  description: string;
  rows: PlanFeature[];
};

const TRUST_CHIPS = [
  "Encryption by default",
  "Virus scan before delivery",
  "Server-side policy enforcement",
  "Audit-ready controls",
];

const PLAN_HIGHLIGHTS = {
  free: [
    "25 MB max upload",
    "100 MB storage",
    "3 active shares",
    "100 views/month",
    "Core controlled delivery workflow",
  ],
  pro: [
    "100 MB max upload",
    "5 GB storage",
    "Unlimited active shares (soft monitored)",
    "Unlimited views (soft monitored)",
    "Audit export + API + webhooks",
  ],
};

const WHY_UPGRADE = [
  {
    title: "Higher throughput",
    body: "More upload and storage capacity for real client-facing document delivery volume.",
  },
  {
    title: "Expanded delivery controls",
    body: "Use custom expiration and permanent shares with policy control boundaries.",
  },
  {
    title: "Richer visibility",
    body: "Move beyond basic activity checks with expanded audit visibility and exports.",
  },
  {
    title: "Automation access",
    body: "Integrate workflows through API and webhooks when operations need automation.",
  },
  {
    title: "More room to operate",
    body: "Run larger active-share and view workloads without hitting Free-tier ceilings.",
  },
  {
    title: "Same security posture",
    body: "Security baseline remains strict across plans while Pro adds operating depth.",
  },
];

const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    title: "Limits",
    description: "Capacity and usage boundaries by plan.",
    rows: [
      { feature: "Price", free: "$0/month", pro: "$12/month" },
      { feature: "Max file upload", free: "25 MB", pro: "100 MB" },
      { feature: "Total storage", free: "100 MB", pro: "5 GB" },
      { feature: "Active shares", free: "3", pro: "Unlimited (soft cap monitored)" },
      { feature: "Views", free: "100/month", pro: "Unlimited (soft monitored)" },
    ],
  },
  {
    title: "Delivery controls",
    description: "How much control you have over share lifecycle.",
    rows: [
      { feature: "Share expiration", free: "Required, up to 7 days", pro: "Custom expiration controls" },
      { feature: "Permanent shares", free: "Not available", pro: "Available with policy controls" },
      { feature: "Allow download toggle", free: "Available, policy-enforced", pro: "Available, policy-enforced" },
    ],
  },
  {
    title: "Visibility and automation",
    description: "Operational insight and integrations.",
    rows: [
      { feature: "Audit visibility", free: "Basic activity visibility", pro: "Audit export + expanded visibility" },
      { feature: "API + webhooks", free: "Not included", pro: "Included" },
    ],
  },
  {
    title: "Security and safeguards",
    description: "Core protection posture across plans.",
    rows: [
      { feature: "Abuse throttling", free: "Strict", pro: "Standard (monitored)" },
      { feature: "Encryption", free: "Required", pro: "Required" },
      { feature: "Virus scanning", free: "Required before delivery", pro: "Required before delivery" },
    ],
  },
];

const SECURITY_BASELINE = [
  {
    title: "Encryption required",
    body: "Document paths are protected by default on both Free and Pro.",
  },
  {
    title: "Scan-first delivery",
    body: "Virus scanning is required before files are eligible for delivery.",
  },
  {
    title: "Policy enforcement",
    body: "Access and share behavior are enforced server-side, not by user guesswork.",
  },
  {
    title: "Operational safeguards",
    body: "Abuse monitoring and health guardrails help keep delivery reliable and safe.",
  },
];

const FAQS = [
  {
    q: "Is Free actually usable?",
    a: "Yes. Free is designed to validate real controlled delivery workflows, not just a demo path.",
  },
  {
    q: "Are security features included on Free?",
    a: "Yes. Encryption and scan-before-delivery posture apply across both plans.",
  },
  {
    q: "What does unlimited mean on Pro?",
    a: "It means no hard product cap on active shares or views, with soft monitoring for anti-abuse and platform health.",
  },
  {
    q: "Are there hidden usage rules?",
    a: "No hidden pricing math. Plan boundaries are explicit, and monitoring policies are documented as safeguards.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. You can start on Free and upgrade to Pro when your volume or control requirements increase.",
  },
];

export default async function PricingPage() {
  const flagsRes = await getBillingFlags();
  if (!flagsRes.flags.pricingUiEnabled) {
    notFound();
  }

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />
        </div>

        <div className="lg:col-span-7">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">Doclinks pricing</span>
          <h1 className="font-editorial mt-5 max-w-4xl text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Transparent pricing for
            <span className="block text-white/72">controlled document delivery.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            Free is real and usable. Pro adds room, control depth, and visibility for teams running higher-throughput
            client and operations workflows.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {TRUST_CHIPS.map((chip) => (
              <span key={chip} className="ui-badge rounded-full px-3 py-1.5 text-xs">
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Get started free
            </Link>
            <Link href="/admin/upgrade" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Upgrade to Pro
            </Link>
            <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              View Doclinks
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="glass-card-strong rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">At a glance</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryCard title="Free" price="$0/mo" subtitle="Best for validating workflow" />
              <SummaryCard title="Pro" price="$12/mo" subtitle="Best for higher-volume delivery" pro />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/58">
              Both plans include enforced security baseline controls. Pro adds capacity, automation, and deeper visibility.
            </p>
          </div>
        </div>
      </section>

      <section id="plans" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Plans"
          title="Choose the plan that matches your delivery volume"
          body="Free supports proof-of-workflow and light use. Pro is built for customer-facing operations that need more throughput and richer control surfaces."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <PlanCard
            tier="Free"
            price="$0/month"
            bestFor="Best for individual testing, light use, and proof of workflow"
            highlights={PLAN_HIGHLIGHTS.free}
            ctaHref="/signup"
            ctaLabel="Start Free"
          />
          <PlanCard
            tier="Pro"
            price="$12/month"
            bestFor="Best for client delivery, teams, higher volume, and audit visibility"
            highlights={PLAN_HIGHLIGHTS.pro}
            ctaHref="/admin/upgrade"
            ctaLabel="Upgrade to Pro"
            recommended
          />
        </div>
      </section>

      <section id="why-upgrade" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Why upgrade"
          title="Why Pro exists"
          body="Pro is for teams that need more operating headroom, stronger lifecycle flexibility, and richer insight into delivery behavior."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WHY_UPGRADE.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section id="comparison" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Plan comparison"
          title="Detailed capabilities by plan"
          body="Clear boundaries, no hidden math. Compare limits, controls, visibility, automation, and security posture side by side."
        />

        <div className="mt-8 space-y-4">
          {COMPARISON_GROUPS.map((group) => (
            <ComparisonGroupCard key={group.title} group={group} />
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-white/58">
          Soft monitored and soft cap monitored mean there is no hard product cap, but usage is monitored for anti-abuse and operational health controls.
        </p>
      </section>

      <section id="security-baseline" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Included baseline"
          title="Security posture included on both plans"
          body="Doclinks is not priced as secure vs insecure. Core safeguards are part of the product baseline across Free and Pro."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SECURITY_BASELINE.map((item) => (
            <FeatureCard key={item.title} title={item.title} body={item.body} />
          ))}
        </div>
      </section>

      <section id="fit" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Which plan fits"
          title="Quick self-selection"
          body="If you are validating or sharing occasionally, start Free. If you are running steady external delivery, Pro removes friction and adds depth."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <FitCard
            title="Choose Free if"
            points={[
              "You are validating controlled delivery workflow",
              "Your monthly volume is modest",
              "You need a serious trial path before committing",
            ]}
          />
          <FitCard
            title="Choose Pro if"
            points={[
              "You need more storage and larger file support",
              "You manage ongoing client or team delivery",
              "You want expanded audit visibility and automation",
            ]}
            pro
          />
        </div>
      </section>

      <section id="faq" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Pricing FAQ"
          title="Answers to common plan questions"
          body="Short, clear answers for faster plan decisions."
        />

        <div className="mt-8 grid gap-3 lg:grid-cols-2">
          {FAQS.map((faq) => (
            <details key={faq.q} className="glass-card rounded-2xl p-5 open:bg-white/10">
              <summary className="cursor-pointer list-none text-sm font-medium text-white/90">{faq.q}</summary>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card-strong ui-sheen rounded-3xl p-7 sm:p-8">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Start with Free. Scale with Pro.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72">
            Choose the plan that matches your delivery stage today, then move up as volume and control requirements grow.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CtaTile href="/signup" title="Start Free" body="Create an account and validate your workflow." />
            <CtaTile href="/admin/upgrade" title="Upgrade to Pro" body="Unlock higher throughput and richer controls." />
            <CtaTile href="/projects/doclinks" title="Learn about Doclinks" body="Review product capabilities and security model." />
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

function SummaryCard(props: { title: string; price: string; subtitle: string; pro?: boolean }) {
  return (
    <div className={props.pro ? "rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4" : "rounded-2xl border border-white/12 bg-black/25 p-4"}>
      <div className="text-xs uppercase tracking-[0.1em] text-white/60">{props.title}</div>
      <div className="mt-1 text-xl font-semibold text-white">{props.price}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/65">{props.subtitle}</div>
    </div>
  );
}

function PlanCard(props: {
  tier: string;
  price: string;
  bestFor: string;
  highlights: string[];
  ctaHref: string;
  ctaLabel: string;
  recommended?: boolean;
}) {
  const wrapperClass = props.recommended
    ? "rounded-3xl border border-amber-300/40 bg-white/5 p-6 ring-1 ring-amber-200/15"
    : "glass-card rounded-3xl p-6";

  const badgeClass = props.recommended
    ? "inline-flex rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)]"
    : "inline-flex rounded-lg border border-sky-200/70 bg-gradient-to-r from-sky-300 to-cyan-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(73,179,255,0.30)]";

  return (
    <article className={wrapperClass}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.12em] text-white/58">{props.tier}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{props.price}</div>
        </div>
        {props.recommended ? <span className="ui-badge rounded-full px-2.5 py-1 text-[11px]">Recommended</span> : null}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/72">{props.bestFor}</p>

      <ul className="mt-5 space-y-2 text-sm text-white/78">
        {props.highlights.map((highlight) => (
          <li key={highlight} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/45" />
            <span>{highlight}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href={props.ctaHref} className={badgeClass}>
          {props.ctaLabel}
        </Link>
        <Link href="/signin" className="btn-base btn-secondary rounded-lg px-3.5 py-2 text-sm">
          Sign in
        </Link>
      </div>
    </article>
  );
}

function FeatureCard(props: { title: string; body: string }) {
  return (
    <article className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </article>
  );
}

function ComparisonGroupCard(props: { group: ComparisonGroup }) {
  return (
    <article className="glass-card rounded-3xl p-5 sm:p-6">
      <h3 className="text-xl font-semibold tracking-tight text-white">{props.group.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/67">{props.group.description}</p>

      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-white/10 md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-white/5 text-white/85">
            <tr>
              <th className="px-4 py-3 font-semibold">Capability</th>
              <th className="px-4 py-3 font-semibold">Free</th>
              <th className="px-4 py-3 font-semibold">Pro</th>
            </tr>
          </thead>
          <tbody>
            {props.group.rows.map((row) => (
              <tr key={row.feature} className="border-t border-white/10">
                <td className="px-4 py-3 text-white/85">{row.feature}</td>
                <td className="px-4 py-3 text-white/70">{row.free}</td>
                <td className="px-4 py-3 text-white/85">{row.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 space-y-3 md:hidden">
        {props.group.rows.map((row) => (
          <div key={row.feature} className="rounded-2xl border border-white/12 bg-black/25 p-4">
            <div className="text-sm font-medium text-white/92">{row.feature}</div>
            <div className="mt-2 grid gap-2 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/75">
                <span className="text-white/55">Free:</span> {row.free}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/85">
                <span className="text-white/55">Pro:</span> {row.pro}
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FitCard(props: { title: string; points: string[]; pro?: boolean }) {
  return (
    <article className={props.pro ? "glass-card-strong rounded-3xl p-6" : "glass-card rounded-3xl p-6"}>
      <h3 className="text-xl font-semibold tracking-tight text-white">{props.title}</h3>
      <ul className="mt-4 space-y-2 text-sm text-white/72">
        {props.points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
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
