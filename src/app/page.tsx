// app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "./components/SiteShell";
import { DemoDocButton } from "@/components/DemoDocButton";
import { getBillingFlags } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Doclinks - Secure Document Delivery Infrastructure",
  description:
    "Deliver sensitive documents without losing control. Access-controlled delivery, enforced policies, and audit visibility.",
};

export default async function HomePage() {
  const flagsRes = await getBillingFlags();
  const showPricingUi = flagsRes.flags.pricingUiEnabled;

  return (
    <SiteShell maxWidth="full">
      <section className="mt-12 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Disciplined. Intentional. Controlled.
          </span>
          <h1 className="font-editorial mt-5 max-w-4xl text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Deliver documents
            <span className="block text-white/70">without losing control.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-relaxed text-white/70">
            Doclinks is secure document delivery infrastructure for small teams that send sensitive files externally.
            Access is tokenized, controlled, and auditable.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/signin" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm font-semibold">
              Sign in
            </Link>
            <Link href="/signup" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Sign up
            </Link>
            <Link href="/projects/doclinks#security-model" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              View Security
            </Link>
            <DemoDocButton
              label="Open demo document"
              className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm"
            />
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            <Stat title="Primary Buyer" value="Small teams (1-25 employees)" />
            <Stat title="Delivery Model" value="Controlled, policy-enforced access" />
            <Stat title="Risk Posture" value="Scan-gated + auditable delivery" />
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong ui-enterprise-grid rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Featured product</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Doclinks</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Built for operations and compliance-minded teams sending contracts, tax records, HR documents, case files, and reports.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill>Encrypted uploads</Pill>
              <Pill>Policy-enforced access</Pill>
              <Pill>Expiring links</Pill>
              <Pill>Audit events</Pill>
              <Pill>Scan-gated delivery</Pill>
              <Pill>Tokenized access</Pill>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/signin" className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm font-semibold">
                Sign in
              </Link>
              <Link href="/signup" className="btn-base btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold">
                Sign up
              </Link>
              {showPricingUi ? (
                <Link href="/projects/doclinks#pricing" className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm">
                  View Pricing
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className={`mt-11 grid gap-4 ${showPricingUi ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <FeatureCard
          title="How It Works"
          description="Upload securely, set access policy, and deliver with control in three clear steps."
          href="/projects/doclinks#how-it-works"
          cta="See workflow"
        />
        <FeatureCard
          title="Security"
          description="System-level controls are enforced by default, not left to user behavior."
          href="/projects/doclinks#security-model"
          cta="Review controls"
        />
        <FeatureCard
          title="Legal Center"
          description="Terms, privacy, DMCA, AUP, DPA, SLA, security policy, and subprocessors synced from repo docs."
          href="/legal"
          cta="Read legal docs"
        />
        {showPricingUi ? (
          <FeatureCard
            title="Pricing"
            description="Transparent Free vs Pro limits with no hidden capability math."
            href="/projects/doclinks#pricing"
            cta="Compare plans"
          />
        ) : null}
      </section>

      <section className="mt-11 grid gap-4 lg:grid-cols-12">
        <div className="glass-card rounded-2xl p-6 lg:col-span-7">
          <h3 className="text-xl font-semibold tracking-tight text-white">Why teams choose controlled delivery</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Mini title="Not storage" body="Doclinks is controlled delivery infrastructure, not cloud file storage." />
            <Mini title="System-enforced controls" body="Security policies are applied by architecture, not optional user steps." />
            <Mini title="Audit visibility" body="Delivery activity is tracked so teams can review and defend process decisions." />
            <Mini title="Scan-first delivery" body="Files flagged as infected, failed, or quarantined are blocked from delivery." />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-6 lg:col-span-5">
          <h3 className="text-xl font-semibold tracking-tight text-white">Address common objections early</h3>
          <div className="mt-5 space-y-3">
            <Step title="Why not Drive/Dropbox?" desc="Because this is controlled delivery with enforceable policies and audit visibility." href="/projects/doclinks#why-doclinks" />
            <Step title="Is this actually secure?" desc="Review the security model and enforced controls before adopting." href="/projects/doclinks#security-model" />
            <Step title="Is adoption heavy?" desc="See the 3-step workflow and start without infrastructure migration." href="/projects/doclinks#how-it-works" />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-[0.1em] text-white/55">{title}</div>
      <div className="mt-1.5 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="ui-badge rounded-full px-2.5 py-1 text-xs">{children}</span>;
}

function FeatureCard(props: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Link href={props.href} className="glass-card rounded-2xl p-6 transition-colors hover:bg-white/12">
      <div className="text-lg font-semibold tracking-tight text-white">{props.title}</div>
      <p className="mt-2.5 text-sm leading-relaxed text-white/70">{props.description}</p>
      <div className="mt-5 text-sm text-white/85">{props.cta}</div>
    </Link>
  );
}

function Mini(props: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-sm font-medium text-white">{props.title}</div>
      <div className="mt-1.5 text-xs leading-relaxed text-white/65">{props.body}</div>
    </div>
  );
}

function Step(props: { title: string; desc: string; href: string }) {
  return (
    <Link href={props.href} className="glass-card rounded-xl p-4 transition-colors hover:bg-white/10">
      <div className="text-sm font-medium text-white">{props.title}</div>
      <div className="mt-1.5 text-xs leading-relaxed text-white/65">{props.desc}</div>
    </Link>
  );
}

