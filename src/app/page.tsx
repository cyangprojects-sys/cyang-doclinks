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
        <div className="lg:col-span-8">
          <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
            Security-first document systems
          </span>
          <h1 className="font-editorial mt-5 max-w-4xl text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Modern document delivery,
            <span className="block text-white/70">without loose edges.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-relaxed text-white/70">
            cyang.io builds practical software with strict defaults, clean operator workflows, and fast response patterns.
            Product UX stays minimal. Policy and controls stay non-negotiable.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/projects" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              View projects
            </Link>
            <Link href="/projects/doclinks" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Explore Doclinks
            </Link>
            <DemoDocButton
              label="Open demo document"
              className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm"
            />
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3">
            <Stat title="Posture" value="Secure by default" />
            <Stat title="Primary" value="Document delivery infra" />
            <Stat title="Mode" value="Fast iteration, strict checks" />
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="glass-card-strong ui-enterprise-grid rounded-3xl p-6">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Featured product</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Doclinks</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Share high-sensitivity files with enforceable controls, malware gating, and immutable audit trails.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill>Encrypted uploads</Pill>
              <Pill>MIME + signature checks</Pill>
              <Pill>Executable/macro blocking</Pill>
              <Pill>Alias + token controls</Pill>
              <Pill>Owner moderation</Pill>
              <Pill>Cron scanning pipeline</Pill>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/admin" className="btn-base btn-primary rounded-xl px-4 py-2.5 text-sm font-semibold">
                Open admin
              </Link>
              <Link href="/api/health" className="btn-base btn-secondary rounded-xl px-4 py-2.5 text-sm">
                Health endpoint
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-11 grid gap-4 md:grid-cols-3">
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

      <section className="mt-11 grid gap-4 lg:grid-cols-12">
        <div className="glass-card rounded-2xl p-6 lg:col-span-7">
          <h3 className="text-xl font-semibold tracking-tight text-white">Operating principles</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Mini title="Secure defaults" body="Controls enforced on the server, not hidden in client state." />
            <Mini title="Compliance clarity" body="Auditable actions, explicit overrides, and predictable policies." />
            <Mini title="Lean architecture" body="Small surface area and practical tooling over complexity." />
            <Mini title="Fast feedback loops" body="Ship in small increments, verify locally, then deploy." />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-6 lg:col-span-5">
          <h3 className="text-xl font-semibold tracking-tight text-white">Start quickly</h3>
          <div className="mt-5 space-y-3">
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

