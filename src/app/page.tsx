// app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "./components/SiteShell";
import { DemoDocButton } from "@/components/DemoDocButton";

export const metadata: Metadata = {
  title: "cyang.io - Chang Yang",
  description:
    "Chang Yang's personal hub for practical projects and security-first product builds.",
};

export default function HomePage() {
  return (
    <SiteShell maxWidth="6xl">
      <section className="mt-12 grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs">
            security-first product studio
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Build useful tools.
            <span className="block text-white/70">Ship with strict defaults.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            cyang.io is a focused set of maintained software projects. The approach is simple:
            clear UX, strong access controls, and reliable operations.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/projects" className="btn-base btn-primary rounded-xl px-5 py-2.5 text-sm font-medium">
              View projects
            </Link>
            <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm">
              Explore Doclinks
            </Link>
            <DemoDocButton
              label="Open demo document"
              className="btn-base btn-secondary rounded-xl px-5 py-2.5 text-sm"
            />
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Stat title="Default posture" value="Secure by default" />
            <Stat title="Primary focus" value="Secure Document Delivery Infrastructure" />
            <Stat title="Operating mode" value="Fast iteration" />
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="glass-card-strong rounded-3xl p-5">
            <div className="text-xs uppercase tracking-[0.12em] text-white/55">Featured product</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Doclinks</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              Share business files with policy-driven controls, immutable audit logging, stricter MIME validation, and safer viewer paths.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill>Encrypted uploads</Pill>
              <Pill>MIME + signature checks</Pill>
              <Pill>Executable/macro blocking</Pill>
              <Pill>Alias + token controls</Pill>
              <Pill>Owner moderation</Pill>
              <Pill>Cloudflare cron jobs</Pill>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/admin" className="btn-base btn-primary rounded-xl px-4 py-2 text-sm font-medium">
                Open admin
              </Link>
              <Link href="/api/health" className="btn-base btn-secondary rounded-xl px-4 py-2 text-sm">
                Health endpoint
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <FeatureCard
          title="Projects"
          description="A curated list of tools and experiments with ongoing maintenance."
          href="/projects"
          cta="Browse projects"
        />
        <FeatureCard
          title="Doclinks"
          description="Secure document sharing with monetization controls and compliance logging."
          href="/projects/doclinks"
          cta="Read product page"
        />
        <FeatureCard
          title="Operations"
          description="Upload docs, monitor activity, review shares, and manage security controls."
          href="/admin"
          cta="Open console"
        />
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-12">
        <div className="glass-card rounded-2xl p-5 lg:col-span-7">
          <h3 className="text-xl font-semibold tracking-tight text-white">Operating principles</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Mini title="Secure defaults" body="Controls enforced on the server, not hidden in client state." />
            <Mini title="Compliance clarity" body="Auditable actions, explicit overrides, and predictable policies." />
            <Mini title="Lean architecture" body="Small surface area and practical tooling over complexity." />
            <Mini title="Fast feedback loops" body="Ship in small increments, verify locally, then deploy." />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 lg:col-span-5">
          <h3 className="text-xl font-semibold tracking-tight text-white">Start quickly</h3>
          <div className="mt-4 space-y-3">
            <Step title="Upload supported files" desc="Docs, sheets, presentations, media, and archives with strict type enforcement." href="/admin/upload" />
            <Step title="Create a share" desc="Issue an alias or share token with expiration and limits." href="/admin/dashboard#shares" />
            <Step title="Test viewer flow" desc="Open a protected link and verify access gate behavior." href="/projects/doclinks" />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-xs text-white/60">{title}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
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
    <Link href={props.href} className="glass-card rounded-2xl p-5 transition-colors hover:bg-white/12">
      <div className="text-lg font-semibold tracking-tight text-white">{props.title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.description}</p>
      <div className="mt-4 text-sm text-white/85">{props.cta}</div>
    </Link>
  );
}

function Mini(props: { title: string; body: string }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-sm font-medium text-white">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/65">{props.body}</div>
    </div>
  );
}

function Step(props: { title: string; desc: string; href: string }) {
  return (
    <Link href={props.href} className="glass-card rounded-xl p-3 hover:bg-white/10">
      <div className="text-sm font-medium text-white">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/65">{props.desc}</div>
    </Link>
  );
}

