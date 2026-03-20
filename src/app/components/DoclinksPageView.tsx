import { BackgroundVideoSection, ScrollRevealFrame } from "./CinematicClient";
import { AmbientScene, SectionTransition, StoryBand, VisualSignalCluster } from "./CinematicScene";
import {
  CTAGroup,
  ContentRail,
  DocumentIndexList,
  DocumentVisual,
  Eyebrow,
  PremiumCard,
  Section,
} from "./PublicPrimitives";
import type { PublicRuntimeConfig } from "@/lib/publicRuntimeConfig";

const OUTCOMES = [
  "Send with control",
  "Enforce at serve time",
  "See what happened",
  "Block unsafe delivery",
];

const TIMELINE = [
  {
    id: "01",
    title: "Upload through secure paths",
    body: "Documents enter protected paths with validation, private storage boundaries, and known workflow states.",
  },
  {
    id: "02",
    title: "Validate and scan",
    body: "Files are checked before the system ever allows public delivery to become eligible.",
  },
  {
    id: "03",
    title: "Set policy rules",
    body: "Expiration, revocation, view bounds, and download posture are attached at the share layer.",
  },
  {
    id: "04",
    title: "Deliver through controlled serving",
    body: "Every access request passes through serve-time policy enforcement instead of relying on URL secrecy.",
  },
];

const FEATURES = [
  {
    eyebrow: "Tokenized access",
    title: "Links act as controlled delivery handles.",
    body: "Doclinks treats every request as an authorization event backed by current policy state.",
    signal: [
      { label: "Token", value: "Maps to bounded share state" },
      { label: "Serve check", value: "Evaluated on every request" },
      { label: "Assumption", value: "No blanket permission by possession" },
    ],
  },
  {
    eyebrow: "Expiration and revocation",
    title: "Access can end when the workflow ends.",
    body: "Time-box exposure, revoke immediately, and avoid endless link residue after a task is complete.",
    signal: [
      { label: "Expiry", value: "Explicit and visible" },
      { label: "Revocation", value: "Immediate from the server side" },
      { label: "Fallback", value: "Access closes instead of lingering" },
    ],
  },
  {
    eyebrow: "View limits and download controls",
    title: "Delivery posture changes to fit the document.",
    body: "Not every file deserves the same recipient experience. Doclinks supports a more deliberate delivery shape.",
    signal: [
      { label: "Views", value: "Bound repeated opens" },
      { label: "Download", value: "Configured per share" },
      { label: "Recipient path", value: "Aligned to sensitivity" },
    ],
  },
  {
    eyebrow: "Audit visibility",
    title: "See enough to support trust and follow-up.",
    body: "Access behavior is legible enough for real operational review without turning the product into a noisy monitoring console.",
    signal: [
      { label: "Reviewability", value: "Delivery activity is visible" },
      { label: "Support", value: "Clear states support response" },
      { label: "Confidence", value: "Evidence instead of guesswork" },
    ],
  },
  {
    eyebrow: "Scan-gated delivery",
    title: "Unsafe file states fail closed.",
    body: "Delivery is conditioned on scan posture, so files in risky states never become casual public links.",
    signal: [
      { label: "Validation", value: "Before public eligibility" },
      { label: "Blocked states", value: "Failed, infected, quarantined" },
      { label: "Default", value: "Protective by design" },
    ],
  },
  {
    eyebrow: "Professional recipient UX",
    title: "Security can still feel calm at the edge.",
    body: "Recipients get a composed experience while teams keep the real control surface behind the scenes.",
    signal: [
      { label: "Recipient view", value: "Clear and professional" },
      { label: "Sender control", value: "Retained at the policy layer" },
      { label: "Trust effect", value: "Stronger delivery confidence" },
    ],
  },
];

const TRUST_DOCUMENTS = [
  { href: "/legal/security-policy", title: "Security Policy", body: "Public control posture and response model." },
  { href: "/status", title: "Status", body: "Operational health and reliability signals." },
  { href: "/privacy", title: "Privacy and Terms", body: "Legal and data-handling surfaces for customer review." },
  { href: "/trust/procurement", title: "Procurement Package", body: "Business-ready documentation gathered into one path." },
  { href: "/security-disclosure", title: "Security Disclosure", body: "Responsible reporting expectations and security route." },
];

export function DoclinksPageView({ publicConfig }: { publicConfig: PublicRuntimeConfig }) {
  const primaryAccessHref = publicConfig.signupEnabled ? "/signup" : "/signin?intent=admin";

  return (
    <>
      <BackgroundVideoSection
        src="/media/cyang-doclinks-signal.mp4"
        poster="/media/cyang-doclinks-signal.jpg"
        priority
        className="mt-3 min-h-[92svh] border-b border-white/8"
        contentClassName="min-h-[92svh]"
      >
        <AmbientScene tone="steel" />
        <div className="mx-auto flex min-h-[92svh] w-full max-w-[1600px] flex-col justify-between px-4 pb-10 pt-18 sm:px-6 sm:pb-12 lg:px-8 lg:pt-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.06fr)_390px] lg:items-end">
            <ScrollRevealFrame className="max-w-5xl">
              <Eyebrow>Flagship product</Eyebrow>
              <h1 className="font-editorial mt-6 text-balance text-[3.15rem] leading-[0.9] tracking-[-0.06em] text-white sm:text-[4.75rem] lg:text-[7rem]">
                Secure document delivery
                <span className="block text-white/62">with enforced controls.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/64 sm:text-xl">
                Share sensitive files with a professional recipient experience while serve-time enforcement,
                lifecycle control, and audit visibility stay intact.
              </p>
              <CTAGroup
                className="mt-8"
                actions={[
                  { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Get started" : "Sign in", tone: "primary" },
                  { href: "/trust", label: "Review Trust", tone: "secondary" },
                ]}
              />
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120} className="floating-stage p-6 sm:p-7">
              <DocumentVisual
                rows={[
                  { label: "Upload path", value: "Validated", tone: "accent" },
                  { label: "Serve posture", value: "Policy checked in real time", tone: "neutral" },
                  { label: "Lifecycle", value: "Expiry and revocation active", tone: "warm" },
                  { label: "Recipient flow", value: "Professional by default", tone: "neutral" },
                ]}
                footer="Doclinks is built for controlled external delivery rather than generic cloud storage sharing."
              />
            </ScrollRevealFrame>
          </div>

          <ScrollRevealFrame delay={220} className="mt-10">
            <div className="grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-4">
              {OUTCOMES.map((item) => (
                <div key={item}>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/58">Outcome</div>
                  <div className="mt-2 text-lg text-white/86">{item}</div>
                </div>
              ))}
            </div>
          </ScrollRevealFrame>
        </div>
      </BackgroundVideoSection>

      <SectionTransition label="Outcome band" />

      <Section className="py-18 sm:py-24">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {OUTCOMES.map((item, index) => (
                <div key={item} className="floating-stage p-6 sm:p-7">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/58">{String(index + 1).padStart(2, "0")}</div>
                  <div className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-white">{item}</div>
                </div>
              ))}
            </div>
          </ScrollRevealFrame>
        </ContentRail>
      </Section>

      <SectionTransition label="Delivery flow" />

      <Section className="py-18 sm:py-24">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
              <div className="lg:sticky lg:top-28">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">How it works</div>
                <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  A secure serving flow in four deliberate steps.
                </h2>
              </div>
              <div className="relative border-l border-white/10 pl-6 sm:pl-8">
                {TIMELINE.map((step, index) => (
                  <div key={step.id} className={index === TIMELINE.length - 1 ? "" : "pb-10"}>
                    <div className="absolute -left-[9px] mt-1 h-4 w-4 rounded-[2px] border border-white/16 bg-black/70" />
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">{step.id}</div>
                    <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{step.title}</div>
                    <p className="mt-3 max-w-xl text-base leading-8 text-white/64">{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollRevealFrame>
        </ContentRail>
      </Section>

      <SectionTransition label="Feature storytelling" />

      <Section className="py-18 sm:py-24">
        <ContentRail className="space-y-10">
          {FEATURES.map((feature, index) => (
            <ScrollRevealFrame key={feature.title} delay={index * 70}>
              <div className="floating-stage p-6 sm:p-8 lg:p-10">
                <AmbientScene tone={index % 2 === 0 ? "cool" : "steel"} className="opacity-70" />
                <div className="relative">
                  <StoryBand
                    eyebrow={feature.eyebrow}
                    title={feature.title}
                    body={feature.body}
                    reverse={index % 2 === 1}
                    aside={<VisualSignalCluster title={feature.eyebrow} items={feature.signal} />}
                  />
                </div>
              </div>
            </ScrollRevealFrame>
          ))}
        </ContentRail>
      </Section>

      <SectionTransition label="Audience and trust" />

      <Section className="py-18 sm:py-24">
        <ContentRail>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <ScrollRevealFrame>
              <PremiumCard strong className="h-full">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Audience and use cases</div>
                <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Built for workflows where external sharing still needs discipline.
                </h2>
                <ul className="mt-6 space-y-4">
                  {[
                    "Operations teams sending time-bound external documents.",
                    "Compliance workflows that need bounded access and reviewable delivery behavior.",
                    "Sensitive external sharing for finance, HR, and legal workflows.",
                    "Small businesses that need stronger trust posture without enterprise complexity.",
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-7 text-white/68">
                      <span className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-sky-300/90" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </PremiumCard>
            </ScrollRevealFrame>

            <ScrollRevealFrame delay={120}>
              <div className="floating-stage p-6 sm:p-8">
                <AmbientScene tone="signal" className="opacity-75" />
                <div className="relative">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Trust architecture</div>
                  <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                    Reviewable trust continuity for the flagship product.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-8 text-white/64">
                    Doclinks inherits the same public trust shell as the wider cyang.io platform, so product review is
                    already connected to policy, status, and procurement routes.
                  </p>
                  <div className="mt-8">
                    <DocumentIndexList items={TRUST_DOCUMENTS} />
                  </div>
                </div>
              </div>
            </ScrollRevealFrame>
          </div>
        </ContentRail>
      </Section>

      <Section className="py-18 sm:py-24">
        <ContentRail>
          <ScrollRevealFrame>
            <div className="floating-stage overflow-hidden px-6 py-10 sm:px-8 sm:py-12 lg:px-10">
              <AmbientScene tone="steel" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/58">Final CTA</div>
                  <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                    Start with Doclinks when delivery needs to stay controlled.
                  </h2>
                  <p className="mt-5 text-base leading-8 text-white/64 sm:text-lg">
                    It is the clearest expression of the cyang.io approach: calm UX, bounded exposure, and trust
                    surfaces that are easy to review.
                  </p>
                </div>
                <CTAGroup
                  actions={[
                    { href: primaryAccessHref, label: publicConfig.signupEnabled ? "Start with Doclinks" : "Sign in", tone: "primary" },
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
