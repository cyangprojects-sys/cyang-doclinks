import {
  CTAGroup,
  DocumentVisual,
  Eyebrow,
  FeatureBand,
  Lead,
  LinkTile,
  MaturityBadge,
  PremiumCard,
  Section,
  SectionHeader,
  TimelineSteps,
} from "./PublicPrimitives";
import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

const OUTCOMES = [
  {
    title: "Send with control",
    body: "Share sensitive files without leaving access behavior to guesswork.",
  },
  {
    title: "Enforce at serve time",
    body: "Authorization, lifecycle, and file-state checks run when access is requested.",
  },
  {
    title: "See what happened",
    body: "Review access activity with audit-friendly visibility instead of vague link assumptions.",
  },
  {
    title: "Block unsafe delivery",
    body: "Failed, infected, or quarantined states stop delivery before exposure happens.",
  },
];

const TIMELINE = [
  { id: "01", title: "Upload through secure paths", body: "Documents enter protected paths with validation and storage boundaries." },
  { id: "02", title: "Validate and scan", body: "Files are checked before public delivery becomes eligible." },
  { id: "03", title: "Set policy rules", body: "Expiration, revocation, view bounds, and delivery posture are configured per share." },
  { id: "04", title: "Deliver through controlled serving", body: "Serve-time checks enforce policy every time a recipient requests access." },
];

const FEATURE_BANDS = [
  {
    eyebrow: "Tokenized access",
    title: "Links are delivery handles, not blanket permission.",
    body: "Doclinks treats every access request as an authorization decision backed by server-side rules.",
    points: [
      "Tokenized links map to bounded share state.",
      "Serve requests are checked against active policy and file state.",
      "Delivery does not rely on secrecy alone.",
    ],
  },
  {
    eyebrow: "Expiration and revocation",
    title: "Access can end when the workflow ends.",
    body: "Time-box links, revoke access quickly, and avoid indefinite document exposure after a task is complete.",
    points: [
      "Expiration is explicit and visible.",
      "Revocation is immediate from the server side.",
      "Lifecycle controls reduce stale sharing risk.",
    ],
  },
  {
    eyebrow: "View limits and download controls",
    title: "Bound the recipient experience to fit the document.",
    body: "Not every file should behave the same way. Doclinks lets teams set more deliberate delivery boundaries.",
    points: [
      "Cap repeated opens where appropriate.",
      "Control download posture by share.",
      "Match delivery behavior to sensitivity.",
    ],
  },
  {
    eyebrow: "Audit visibility",
    title: "Review what happened without creating noise.",
    body: "Access behavior is legible enough for operational review, support, and follow-up without overwhelming teams.",
    points: [
      "Delivery activity is observable.",
      "Events support internal review and customer confidence.",
      "Operational clarity improves incident response.",
    ],
  },
  {
    eyebrow: "Scan-gated delivery",
    title: "Unsafe file states do not get a public path.",
    body: "Delivery is conditioned on scan posture so risky states fail closed instead of leaking through convenience.",
    points: [
      "Validation precedes public serving.",
      "Failed or quarantined states block delivery.",
      "Protective defaults stay active under pressure.",
    ],
  },
  {
    eyebrow: "Professional recipient UX",
    title: "Security controls do not have to feel chaotic.",
    body: "Recipients get a calm, professional experience while teams retain the control surface behind it.",
    points: [
      "Clean receiving flow with clear expectations.",
      "Operational controls stay with the sender.",
      "Professional delivery supports trust at the edge.",
    ],
  },
];

const USE_CASES = [
  "Operations teams sending time-bound external documents.",
  "Compliance workflows that need bounded access and reviewable delivery behavior.",
  "Sensitive external sharing for finance, HR, and legal workflows.",
  "Small businesses that need stronger trust posture without enterprise complexity.",
];

const TRUST_ITEMS = [
  { href: "/legal/security-policy", title: "Security Policy", body: "Review the product security model and public controls.", meta: "Security" },
  { href: "/status", title: "Status", body: "Operational health and public reliability surfaces.", meta: "Operations" },
  { href: "/privacy", title: "Privacy and Terms", body: "Legal and data-handling surfaces for customer review.", meta: "Legal" },
  { href: "/trust/procurement", title: "Procurement Package", body: "Business-ready trust documents gathered into one path.", meta: "Procurement" },
  { href: "/security-disclosure", title: "Security Disclosure", body: "Responsible disclosure route and testing expectations.", meta: "Disclosure" },
];

function visualRows(index: number) {
  if (index === 0) {
    return [
      { label: "Policy check", value: "Required", tone: "accent" as const },
      { label: "Recipient state", value: "Unverified until serve", tone: "neutral" as const },
      { label: "Exposure", value: "Bounded", tone: "warm" as const },
    ];
  }

  if (index === 1) {
    return [
      { label: "Link expiry", value: "7 days", tone: "accent" as const },
      { label: "Revocation", value: "Instant", tone: "neutral" as const },
      { label: "Fallback", value: "Access closed", tone: "warm" as const },
    ];
  }

  if (index === 2) {
    return [
      { label: "Views", value: "5 remaining", tone: "accent" as const },
      { label: "Download", value: "Blocked", tone: "neutral" as const },
      { label: "Recipient path", value: "Viewer only", tone: "warm" as const },
    ];
  }

  if (index === 3) {
    return [
      { label: "Open", value: "Logged", tone: "accent" as const },
      { label: "Location", value: "Reviewable", tone: "neutral" as const },
      { label: "Workflow", value: "Traceable", tone: "warm" as const },
    ];
  }

  if (index === 4) {
    return [
      { label: "Scan result", value: "Pending / required", tone: "accent" as const },
      { label: "Unsafe state", value: "Blocked", tone: "neutral" as const },
      { label: "Serve posture", value: "Fail closed", tone: "warm" as const },
    ];
  }

  return [
    { label: "Recipient view", value: "Calm", tone: "accent" as const },
    { label: "Sender controls", value: "Visible", tone: "neutral" as const },
    { label: "Trust signal", value: "Professional", tone: "warm" as const },
  ];
}

export function DoclinksPageView({ publicConfig }: { publicConfig: PublicRuntimeConfig }) {
  const primaryAccessHref = publicConfig.signupEnabled ? "/signup" : "/signin?intent=admin";

  return (
    <>
      <Section className="pt-8 sm:pt-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.04fr)_minmax(320px,0.96fr)] lg:items-end">
          <div className="max-w-4xl">
            <Eyebrow>Flagship product</Eyebrow>
            <h1 className="font-editorial mt-6 text-balance text-4xl leading-[0.98] tracking-[-0.03em] text-white sm:text-5xl lg:text-7xl">
              Secure document delivery with enforced controls.
            </h1>
            <Lead className="mt-6 max-w-2xl">
              Share sensitive files with a professional recipient experience while policy, validation, and access
              controls stay enforced behind the scenes.
            </Lead>
            <CTAGroup
              className="mt-8"
              actions={[
                { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Get started" : "Sign in", tone: "primary" },
                { href: "/trust", label: "Review Trust", tone: "secondary" },
              ]}
            />
          </div>

          <PremiumCard strong className="min-h-[420px]">
            <DocumentVisual
              rows={[
                { label: "Upload path", value: "Validated", tone: "accent" },
                { label: "Scan posture", value: "Required before serve", tone: "neutral" },
                { label: "Lifecycle", value: "Expiry and revocation active", tone: "warm" },
                { label: "Recipient path", value: "Professional access flow", tone: "neutral" },
              ]}
              footer="Doclinks is built for controlled external sharing, not casual file exposure."
            />
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Outcome band"
          title="Built around the outcomes teams actually need."
          body="Control, enforcement, visibility, and safety are first-class parts of the product story."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {OUTCOMES.map((item) => (
            <PremiumCard key={item.title} className="h-full">
              <h3 className="text-2xl font-semibold tracking-tight text-white">{item.title}</h3>
              <Lead className="mt-4 text-base">{item.body}</Lead>
            </PremiumCard>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="How it works"
          title="A four-step flow from upload to controlled serving."
          body="The product stays easy to operate while enforcement stays server-side."
        />
        <div className="mt-8">
          <TimelineSteps steps={TIMELINE} />
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Feature storytelling"
          title="Controls designed for real external workflows."
          body="Each part of the product exists to reduce ambiguity after a file leaves your team."
        />
        <div className="mt-8 space-y-4">
          {FEATURE_BANDS.map((band, index) => (
            <FeatureBand
              key={band.title}
              eyebrow={band.eyebrow}
              title={band.title}
              body={band.body}
              points={band.points}
              reverse={index % 2 === 1}
              visual={<DocumentVisual rows={visualRows(index)} footer={band.eyebrow} />}
            />
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-4 lg:grid-cols-12">
          <PremiumCard strong className="lg:col-span-7">
            <Eyebrow>Audience and use cases</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Built for workflows where external sharing still needs discipline.
            </h2>
            <ul className="mt-6 space-y-3">
              {USE_CASES.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-7 text-white/68">
                  <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-sky-300/90" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </PremiumCard>

          <PremiumCard className="lg:col-span-5">
            <Eyebrow>Live posture</Eyebrow>
            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="text-xl font-semibold text-white">Doclinks</div>
              <MaturityBadge tone="live">Live</MaturityBadge>
            </div>
            <Lead className="mt-4 text-base">
              The flagship product is already anchored in public trust surfaces, policy documentation, and operational
              discoverability.
            </Lead>
          </PremiumCard>
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="Trust architecture"
          title="Everything needed for product review is already connected."
          body="Doclinks inherits the same trust shell as the broader cyang.io platform."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <LinkTile key={item.href} href={item.href} title={item.title} body={item.body} meta={item.meta} />
          ))}
        </div>
      </Section>

      <Section>
        <PremiumCard strong className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Eyebrow>Final call</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              Start with Doclinks when document delivery needs to stay controlled.
            </h2>
            <Lead className="mt-4 max-w-2xl">
              It is the clearest expression of the cyang.io approach: calm UX, bounded exposure, and trust surfaces
              that are easy to review.
            </Lead>
          </div>
          <CTAGroup
            actions={[
              { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Start with Doclinks" : "Sign in", tone: "primary" },
              { href: "/contact", label: "Contact", tone: "secondary" },
            ]}
          />
        </PremiumCard>
      </Section>
    </>
  );
}
