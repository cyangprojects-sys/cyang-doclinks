import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../../components/SiteShell";
import { getBillingFlags } from "@/lib/settings";
import { isSignupEnabled } from "@/lib/signup";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Doclinks - cyang.io",
  description:
    "Doclinks is secure external document delivery with policy-enforced access, share controls, scan-gated serving, and audit visibility.",
};

type Feature = {
  title: string;
  desc: string;
};

type Step = {
  id: string;
  title: string;
  body: string;
};

type UseCase = {
  title: string;
  body: string;
};

type Faq = {
  q: string;
  a: string;
};

const TRUST_CHIPS = [
  "Encryption default",
  "Server-side enforcement",
  "Private object storage",
  "Audit trail",
  "Rate limits",
];

const DIFFERENTIATORS: Feature[] = [
  {
    title: "Controlled delivery, not generic storage",
    desc: "Doclinks is built for sensitive external sharing with policy checks on every request.",
  },
  {
    title: "Server-side enforcement",
    desc: "Expiration, max views, revocation, and policy states are enforced by architecture.",
  },
  {
    title: "Operational visibility",
    desc: "Access and delivery behavior are reviewable with audit-friendly event tracking.",
  },
  {
    title: "Secure defaults",
    desc: "Scan-gated serving, bounded access patterns, and abuse controls are active by default.",
  },
];

const FLOW_STEPS: Step[] = [
  {
    id: "01",
    title: "Upload securely",
    body: "Upload through protected paths with validation and scanning before delivery.",
  },
  {
    id: "02",
    title: "Set policy",
    body: "Apply expiration, view limits, and lifecycle controls to each share.",
  },
  {
    id: "03",
    title: "Share with control",
    body: "Send links backed by server-side checks instead of relying on secrecy.",
  },
  {
    id: "04",
    title: "Monitor or revoke",
    body: "Track activity, review behavior, and revoke access immediately when needed.",
  },
];

const USE_CASES: UseCase[] = [
  {
    title: "Contracts and agreements",
    body: "Send legal documents with clear expiration windows and delivery controls.",
  },
  {
    title: "HR and people operations",
    body: "Share sensitive employee files through auditable, policy-enforced access.",
  },
  {
    title: "Finance and operations",
    body: "Deliver invoices, tax files, and reports without uncontrolled resharing risk.",
  },
  {
    title: "Vendor and client exchange",
    body: "Use controlled links for external workflows where document handling matters.",
  },
];

const CONTROL_SURFACES: Feature[] = [
  {
    title: "Expiration",
    desc: "Time-box access to reduce lingering exposure after delivery.",
  },
  {
    title: "Max views",
    desc: "Cap opens to limit uncontrolled reuse and accidental overexposure.",
  },
  {
    title: "Revocation",
    desc: "Disable a share instantly from the server side.",
  },
  {
    title: "Password gates",
    desc: "Add another access boundary for higher-sensitivity documents.",
  },
  {
    title: "Audit logs",
    desc: "Review delivery behavior with traceable access events.",
  },
  {
    title: "Scan-gated blocking",
    desc: "Files in failed, infected, or quarantined states are blocked from delivery.",
  },
];

const ARCHITECTURE_SUMMARY: Feature[] = [
  {
    title: "Storage + encryption",
    desc: "Uploads are encrypted by default and stored behind private object boundaries.",
  },
  {
    title: "Access enforcement",
    desc: "Every serve request is authorized server-side against policy state.",
  },
  {
    title: "Auditability",
    desc: "Operational events support review, troubleshooting, and process confidence.",
  },
  {
    title: "Abuse protection",
    desc: "Rate limiting and guarded request paths reduce misuse and brute-force behavior.",
  },
];

const FAQS: Faq[] = [
  {
    q: "What makes this different from cloud drive links?",
    a: "Doclinks is designed for controlled external delivery. Access decisions are enforced server-side with lifecycle controls and audit visibility.",
  },
  {
    q: "What happens if a link is forwarded?",
    a: "Forwarding is expected. Security relies on policy enforcement such as expiration, max views, revocation, and request controls, not URL secrecy alone.",
  },
  {
    q: "Can we revoke access immediately?",
    a: "Yes. Revocation is a first-class server-side control.",
  },
  {
    q: "Is this usable for non-technical teams?",
    a: "Yes. The product is built for operations, compliance, and small teams that need simple, predictable workflows.",
  },
  {
    q: "Do you block risky file states?",
    a: "Yes. Failed, infected, and quarantined scan states are blocked from delivery.",
  },
];

const MOMENTUM_ITEMS = [
  "Share lifecycle controls continue to harden with clearer operational states.",
  "Security and governance flows are being tightened across workspace and serve paths.",
  "Audit and trust surfaces are improving for faster customer review and validation.",
  "Performance and UX refinements keep the product fast while preserving guardrails.",
];

export default async function DoclinksPage() {
  const flagsRes = await getBillingFlags();
  const showPricingUi = flagsRes.flags.pricingUiEnabled;
  const signupEnabled = isSignupEnabled();
  const primaryAccessHref = signupEnabled ? "/signup" : "/signin?intent=admin";

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/12 blur-3xl" />
        </div>

        <div className="lg:col-span-7">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Flagship Product - Doclinks
          </span>
          <h1 className="font-editorial mt-5 max-w-4xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Secure external document delivery
            <span className="block text-white/72">without losing operational control.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
            Doclinks helps teams share sensitive files through policy-enforced access, auditable delivery behavior, and
            controls that stay reliable under real usage.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {TRUST_CHIPS.map((chip) => (
              <span key={chip} className="ui-badge rounded-full px-3 py-1.5 text-xs">
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href={primaryAccessHref} className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              {signupEnabled ? "Get started" : "Sign in"}
            </Link>
            {showPricingUi ? (
              <Link href="/pricing" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
                View pricing
              </Link>
            ) : null}
            <Link href="#security-model" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              View security model
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <HeroStat label="Primary use" value="Controlled external sharing" />
            <HeroStat label="Risk posture" value="Scan-gated and auditable" />
            <HeroStat label="Adoption" value="Small teams to ops-heavy orgs" />
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="glass-card-strong ui-enterprise-grid rounded-3xl p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.14em] text-white/55">Product preview</div>
              <StatusBadge label="Live" tone="live" />
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Delivery command panel</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Configure link controls, track usage, and revoke access from one clean workflow.
            </p>

            <div className="mt-5 space-y-3">
              <PreviewRow title="Share policy" body="Expires in 7 days, max views 5, password optional" />
              <PreviewRow title="Serve posture" body="Server-authorized requests only, raw access blocked" />
              <PreviewRow title="Current state" body="Scanned and eligible for controlled delivery" />
            </div>

            <div className="mt-6 rounded-2xl border border-white/12 bg-black/30 p-4 text-xs leading-relaxed text-white/62">
              Built for operations and compliance-friendly teams that need strong defaults without heavy workflow friction.
            </div>
          </div>
        </div>
      </section>

      <section id="why-doclinks" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Why Doclinks"
          title="Built for controlled delivery, not open-ended file sharing."
          body="Doclinks focuses on predictable, enforceable external delivery with controls and reviewability designed into the product surface."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DIFFERENTIATORS.map((item) => (
            <FeatureCard key={item.title} title={item.title} desc={item.desc} />
          ))}
        </div>
      </section>

      <section id="how-it-works" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="How it works"
          title="A clear workflow from upload to controlled access"
          body="The delivery lifecycle stays simple for users while controls stay enforced by the system."
        />

        <div className="mt-8 glass-card-strong rounded-3xl p-6 sm:p-7">
          <div className="grid gap-4 lg:grid-cols-4">
            {FLOW_STEPS.map((step) => (
              <FlowCard key={step.id} id={step.id} title={step.title} body={step.body} />
            ))}
          </div>
        </div>
      </section>

      <section id="use-cases" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Built for sensitive sharing"
          title="Practical use cases teams run every week"
          body="Doclinks is designed for high-sensitivity workflows that need professional delivery controls without heavy complexity."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {USE_CASES.map((useCase) => (
            <UseCaseCard key={useCase.title} title={useCase.title} body={useCase.body} />
          ))}
        </div>
      </section>

      <section id="comparison" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Security posture"
          title="Security that does not rely on secret links"
          body="Ordinary share URLs often assume possession equals permission. Doclinks treats every access request as an authorization decision."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <CompareCard
            title="Ordinary share links"
            subtitle="Convenient, but often weak for sensitive delivery"
            tone="base"
            points={[
              "Link possession may be treated as full access",
              "Limited lifecycle controls once shared",
              "Weak operational visibility for review",
              "Harder to enforce consistent policy boundaries",
            ]}
          />
          <CompareCard
            title="Doclinks"
            subtitle="Controlled external delivery by default"
            tone="strong"
            points={[
              "Server-side authorization on each serve request",
              "Expiration, max views, and revocation controls",
              "Audit-friendly activity visibility",
              "Scan and policy states can block delivery automatically",
            ]}
          />
        </div>
      </section>

      <section id="controls" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Control surface"
          title="Operational controls that stay easy to use"
          body="Policy controls are visible, clear, and built to support everyday external sharing decisions."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CONTROL_SURFACES.map((item) => (
            <FeatureCard key={item.title} title={item.title} desc={item.desc} />
          ))}
        </div>
      </section>

      <section id="security-model" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="Product confidence"
          title="Security architecture in plain language"
          body="Doclinks combines protective storage boundaries, strict serve-time checks, and operational controls to keep sensitive delivery trustworthy."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ARCHITECTURE_SUMMARY.map((item) => (
            <FeatureCard key={item.title} title={item.title} desc={item.desc} />
          ))}
        </div>
      </section>

      <section id="actions" className="mt-16 md:mt-20">
        <div className="glass-card-strong ui-sheen rounded-3xl p-7 sm:p-8">
          <SectionIntro
            eyebrow="Live product actions"
            title="Try Doclinks now"
            body="Start with a real account, review plan fit, and evaluate the trust posture end to end."
          />

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ActionTile
              href={primaryAccessHref}
              title={signupEnabled ? "Create account" : "Sign in"}
              body="Start controlled delivery workflows."
            />
            <ActionTile href="/signin" title="Sign in" body="Access your workspace and continue active workflows." />
            <ActionTile href="/trust" title="Explore trust center" body="Review security, policy, and operations resources." />
            <ActionTile href="/contact" title="Contact" body="Ask product or business questions." />
            {showPricingUi ? (
              <ActionTile href="/pricing" title="View pricing" body="Compare plans and controls." />
            ) : (
              <ActionTile href="#security-model" title="Review controls" body="Explore the architecture and security model." />
            )}
          </div>
        </div>
      </section>

      {showPricingUi ? (
        <section id="pricing" className="mt-16 md:mt-20">
          <SectionIntro
            eyebrow="Pricing preview"
            title="Simple pricing with clear capability boundaries"
            body="Free is useful for early workflows. Pro adds higher limits and deeper operational controls."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <PricingCard
              tier="Free"
              price="$0/month"
              tone="base"
              points={[
                "25 MB max upload",
                "100 MB total storage",
                "Core sharing controls",
                "Basic audit visibility",
              ]}
              ctaHref={primaryAccessHref}
              ctaLabel={signupEnabled ? "Start free" : "Sign in"}
            />
            <PricingCard
              tier="Pro"
              price="$12/month"
              tone="pro"
              points={[
                "100 MB max upload",
                "5 GB total storage",
                "Advanced control surface",
                "Audit export and stronger operations tooling",
              ]}
              ctaHref="/signin?intent=admin"
              ctaLabel="Upgrade existing workspace"
            />
          </div>

          <Link href="/pricing" className="mt-5 inline-flex text-sm text-white/80 underline underline-offset-4 hover:text-white">
            View full plan comparison
          </Link>
        </section>
      ) : null}

      <section id="faq" className="mt-16 md:mt-20">
        <SectionIntro
          eyebrow="FAQ"
          title="Common questions"
          body="Short answers to help teams evaluate fit quickly."
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

      <section className="mt-16 md:mt-20">
        <div className="glass-card rounded-3xl p-6 sm:p-7">
          <SectionIntro
            eyebrow="Shipping momentum"
            title="Recent improvements"
            body="Doclinks continues to harden as a practical product for controlled external delivery."
          />

          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {MOMENTUM_ITEMS.map((item) => (
              <li key={item} className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm leading-relaxed text-white/70">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card-strong rounded-3xl p-7 sm:p-8">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Ready to move beyond basic share links?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/72">
            Doclinks gives teams a controlled, auditable, security-first way to deliver sensitive files externally.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={primaryAccessHref} className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              {signupEnabled ? "Create account" : "Sign in"}
            </Link>
            <Link href="/trust" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Review trust
            </Link>
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

function HeroStat(props: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-[0.11em] text-white/55">{props.label}</div>
      <div className="mt-1.5 text-sm font-medium text-white/92">{props.value}</div>
    </div>
  );
}

function StatusBadge(props: { label: string; tone: "live" | "base" }) {
  const toneClass =
    props.tone === "live"
      ? "border-emerald-200/30 bg-emerald-300/10 text-emerald-100"
      : "border-white/20 bg-white/10 text-white/80";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>{props.label}</span>;
}

function PreviewRow(props: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4">
      <div className="text-xs uppercase tracking-[0.1em] text-white/55">{props.title}</div>
      <div className="mt-1 text-sm text-white/82">{props.body}</div>
    </div>
  );
}

function FeatureCard(props: { title: string; desc: string }) {
  return (
    <div className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.desc}</p>
    </div>
  );
}

function FlowCard(props: { id: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-5">
      <div className="inline-flex rounded-lg border border-sky-200/30 bg-sky-300/10 px-2.5 py-1 text-[11px] font-semibold tracking-[0.1em] text-sky-100">
        {props.id}
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </div>
  );
}

function UseCaseCard(props: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </div>
  );
}

function CompareCard(props: { title: string; subtitle: string; points: string[]; tone: "base" | "strong" }) {
  const className =
    props.tone === "strong"
      ? "glass-card-strong rounded-3xl p-6"
      : "glass-card rounded-3xl p-6";

  return (
    <div className={className}>
      <h3 className="text-xl font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.subtitle}</p>
      <ul className="mt-4 space-y-2">
        {props.points.map((point) => (
          <li key={point} className="flex gap-2 text-sm leading-relaxed text-white/70">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionTile(props: { title: string; body: string; href?: string }) {
  return (
    <Link href={props.href || "/"} className="rounded-2xl border border-white/12 bg-black/25 p-5 transition-colors hover:bg-white/10">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-white/64">{props.body}</p>
      <div className="mt-4 text-sm text-white/84">Open</div>
    </Link>
  );
}

function PricingCard(props: {
  tier: string;
  price: string;
  points: string[];
  ctaHref: string;
  ctaLabel: string;
  tone: "base" | "pro";
}) {
  const className =
    props.tone === "pro"
      ? "rounded-3xl border border-amber-300/35 bg-white/5 p-6 ring-1 ring-amber-200/15"
      : "glass-card rounded-3xl p-6";

  const badgeClassName =
    props.tone === "pro"
      ? "inline-flex rounded-lg border border-amber-200/70 bg-gradient-to-r from-amber-300 to-amber-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(232,194,122,0.32)]"
      : "inline-flex rounded-lg border border-sky-200/70 bg-gradient-to-r from-sky-300 to-cyan-200 px-3 py-1.5 text-sm font-semibold text-black shadow-[0_8px_24px_rgba(73,179,255,0.30)]";

  return (
    <div className={className}>
      <div className={badgeClassName}>
        {props.tier} - {props.price}
      </div>
      <ul className="mt-4 space-y-2 text-sm text-white/80">
        {props.points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/40" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <Link href={props.ctaHref} className="btn-base btn-secondary mt-6 inline-flex rounded-xl px-4 py-2.5 text-sm">
        {props.ctaLabel}
      </Link>
    </div>
  );
}
