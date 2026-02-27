// app/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export const metadata: Metadata = {
  title: "About — cyang.io",
  description:
    "About Chang Yang and cyang.io: a small hub for practical tools, experiments, and security-first builds like Doclinks.",
};

export default function AboutPage() {
  return (
    <SiteShell maxWidth="6xl">
      <section className="relative mt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="absolute -bottom-36 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        </div>

        <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          About
        </p>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
          About
          <span className="block text-white/70">How I build and what I’m optimizing for.</span>
        </h1>

        <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/70">
          cyang.io is a small, product-minded portfolio — a handful of tools that stay
          maintained, get safer over time, and feel professional to use. I’m especially
          interested in secure sharing, operational clarity, and fast UX.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <Card
              title="How I build"
              desc="A short playbook that keeps things shipping and hard to misuse."
              items={[
                "Start minimal → iterate quickly",
                "Prefer boring tech that scales",
                "Keep the surface area small",
                "Make safe defaults the easy path",
              ]}
            />
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="text-sm font-medium text-white/90">Current focus</div>
              <div className="mt-3 space-y-3">
                <FocusRow
                  title="Doclinks"
                  desc="Security-first file sharing with short links, immutable logs, and strict upload validation."
                  href="/projects/doclinks"
                />
                <FocusRow
                  title="Admin tools"
                  desc="Operational clarity: uploads, access logs, analytics, guardrails."
                  href="/admin"
                />
                <FocusRow
                  title="Hardening"
                  desc="MIME/signature checks, executable/macro blocking, and scan-first serving."
                  href="/projects/doclinks"
                />
              </div>

              <div className="mt-6 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Guiding constraint</div>
                <div className="mt-1 text-sm font-medium text-white/90">Security is the priority.</div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  If a feature increases risk or ambiguity, it needs guardrails or it doesn’t ship.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card
            title="What I like building"
            desc="The kinds of projects that stay fun to maintain."
            items={[
              "Simple tools with strong UX",
              "Automation that removes friction",
              "Secure sharing and clean access control",
              "Systems that are easy to operate and debug",
            ]}
          />
          <Card
            title="What I optimize for"
            desc="A short set of priorities that guide most decisions."
            items={[
              "Security-first where it matters",
              "Auditability and operational clarity",
              "Performance and responsiveness",
              "Minimal UI and predictable behavior",
            ]}
          />
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-lg font-semibold">What “competitor-level” means here</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Clean UX is table stakes. The differentiator is safer defaults and operational
                confidence: logs you can trust, policies you can reason about, and fewer places
                to be wrong.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Pill title="Predictable policy" desc="Expiry/max views/revocation behave the same everywhere." />
                <Pill title="Observable" desc="Audit events + analytics rollups make behavior reviewable." />
                <Pill title="Secure by default" desc="Server-side enforcement, private storage posture." />
                <Pill title="Fast" desc="Minimal pages and snappy interactions." />
              </div>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-lg font-semibold">Where to start</h2>
              <div className="mt-4 grid gap-3">
                <StartCard title="Doclinks product page" desc="Controls, security model, roadmap." href="/projects/doclinks" />
                <StartCard title="Upload files" desc="Create a doc and generate a share link." href="/admin" />
                <StartCard title="Project list" desc="Everything else that’s maintained." href="/projects" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <h2 className="text-lg font-semibold">What’s on this site</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Some pages are public-facing (projects, writeups). Some are tools (doc upload,
            magic links). The point is not to be big — it’s to be useful.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Tag>Next.js</Tag>
            <Tag>Vercel</Tag>
            <Tag>Cloudflare R2</Tag>
            <Tag>Postgres</Tag>
            <Tag>Magic Links</Tag>
            <Tag>Audit Logs</Tag>
            <Tag>MIME Validation</Tag>
            <Tag>Scan-first Serve</Tag>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/projects"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
            >
              Browse projects
            </Link>
            <Link
              href="/projects/doclinks"
              className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
            >
              See Doclinks →
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function Card({
  title,
  desc,
  items,
}: {
  title: string;
  desc: string;
  items: string[];
}) {
  return (
    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
      <ul className="mt-4 space-y-2 text-sm text-white/70">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
      {children}
    </span>
  );
}

function FocusRow(props: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={props.href}
      className="flex items-start justify-between gap-6 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 hover:bg-white/10"
    >
      <div>
        <div className="text-sm font-medium text-white/90">{props.title}</div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
      </div>
      <span className="mt-0.5 text-white/50">→</span>
    </Link>
  );
}

function Pill(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
    </div>
  );
}

function StartCard(props: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={props.href}
      className="flex items-start justify-between gap-6 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 hover:bg-white/10"
    >
      <div>
        <div className="text-sm font-medium text-white/90">{props.title}</div>
        <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
      </div>
      <span className="mt-0.5 text-white/50">→</span>
    </Link>
  );
}
