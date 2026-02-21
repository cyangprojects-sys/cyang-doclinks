// app/projects/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";
import { DemoDocButton } from "@/components/DemoDocButton";
import { DEMO_DOC_URL } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Projects — cyang.io",
  description:
    "A curated list of projects and experiments Chang Yang maintains, including Doclinks (secure document sharing).",
};

type Project = {
  title: string;
  label: string;
  desc: string;
  href: string;
  status: "Live" | "Building" | "Idea";
  tags: string[];
};

const PROJECTS: Project[] = [
  {
    title: "Doclinks",
    label: "Primary",
    desc: "Secure document sharing via short links, backed by R2 + DB gating + audit logs.",
    href: "/projects/doclinks",
    status: "Live",
    tags: ["Security-first", "R2", "Postgres"],
  },
  {
    title: "Admin & Analytics",
    label: "Ops",
    desc: "Owner tools for uploads, access logs, rate limiting, and operational guardrails.",
    href: "/admin",
    status: "Building",
    tags: ["Audit", "Rate limits", "Cron"],
  },
  {
    title: "Automation Tools",
    label: "Toolkit",
    desc: "Workflow helpers that remove friction and save time — built when they’re needed.",
    href: "/about",
    status: "Idea",
    tags: ["Automation", "Quality-of-life"],
  },
];

export default function ProjectsPage() {
  return (
    <SiteShell maxWidth="6xl">
      <section className="relative mt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-28 left-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        </div>

        <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Projects
        </p>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
          A small studio of maintained tools
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
          I keep the list short on purpose. If it’s here, it’s either live or actively
          being pushed toward “safe defaults + great UX.”
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-xs text-white/60">Flagship</div>
                  <div className="mt-1 text-2xl font-semibold">Doclinks</div>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    Secure document sharing with short links — built for
                    DocSend-level polish, with a smaller attack surface and server-side
                    enforcement.
                  </p>
                </div>
                <StatusBadge status="Live" />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Micro title="Controls" desc="Expiration, max views, revocation." />
                <Micro title="Observability" desc="Audit trail, analytics rollups." />
                <Micro title="Security" desc="R2 private objects, server checks." />
                <Micro title="UX" desc="Fast pages, minimal UI, predictable flows." />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/projects/doclinks"
                  className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90"
                >
                  See Doclinks →
                </Link>
                <Link
                  href="/admin"
                  className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
                >
                  Upload a PDF
                </Link>
              </div>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-sm font-medium text-white/90">Now shipping</h2>
              <div className="mt-4 space-y-3">
                <NowRow title="Magic links" desc="Friendly aliases, strict server checks." />
                <NowRow title="Audit logs" desc="Operational clarity: who/when/how." />
                <NowRow title="Guardrails" desc="Rate limiting and safer defaults." />
              </div>

              <div className="mt-6 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Quick demo</div>
                <DemoDocButton
                  label="Open demo document →"
                  className="mt-1 inline-flex text-sm text-white/85 hover:underline"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PROJECTS.filter((p) => p.title !== "Doclinks").map((p) => (
            <ProjectCard key={p.title} project={p} />
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-lg font-semibold">What “maintained” means here</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Stable endpoints, small surface area, and security-first defaults. If a tool
                is public-facing, it needs to be predictable, auditable, and hard to misuse.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Pill title="Security posture" desc="Server-side checks, safe defaults, sane limits." />
                <Pill title="Operational clarity" desc="Audit trails, simple admin tools, clean errors." />
                <Pill title="Performance" desc="Fast UX, minimal pages, straightforward architecture." />
                <Pill title="Iteration" desc="Ship small → observe → improve." />
              </div>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-lg font-semibold">Quick links</h2>
              <div className="mt-4 grid gap-3">
                <QuickLink
                  name="Upload a document"
                  desc="Create a doc and get a shareable magic link."
                  href="/admin"
                />
                <QuickLink
                  name="Open a demo document"
                  desc="View a live shared document (opens in a new tab)."
                  href={DEMO_DOC_URL}
                />
                <QuickLink
                  name="Read the approach"
                  desc="How I think about small surface area and safe defaults."
                  href="/about"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Building like a product, not a demo</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                The goal is competitor-level polish: clean UI, predictable policy behavior, and
                security that holds up under real usage.
              </p>
            </div>
            <Link
              href="/projects/doclinks"
              className="rounded-2xl bg-white px-5 py-3 text-sm font-medium text-black hover:bg-white/90"
            >
              Go to Doclinks →
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function Micro(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
    </div>
  );
}

function NowRow(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: Project["status"] }) {
  const styles =
    status === "Live"
      ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20"
      : status === "Building"
        ? "bg-white/10 text-white/80 ring-white/15"
        : "bg-white/5 text-white/60 ring-white/10";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] ring-1 ${styles}`}>
      {status}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70 ring-1 ring-white/10">
      {children}
    </span>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={project.href}
      className="group rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/10"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-white/60">{project.label}</div>
        <StatusBadge status={project.status} />
      </div>

      <div className="mt-2 text-lg font-semibold">{project.title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{project.desc}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>

      <div className="mt-5 text-sm text-white/80 group-hover:text-white">Open →</div>
    </Link>
  );
}

function Pill({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60">{desc}</div>
    </div>
  );
}

function QuickLink(props: { name: string; desc: string; href: string }) {
  const isExternal = /^https?:\/\//i.test(props.href);

  if (isExternal) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-6 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 hover:bg-white/10"
        aria-label={`${props.name} (opens in a new tab)`}
      >
        <div>
          <div className="text-sm font-medium text-white/90">{props.name}</div>
          <div className="mt-1 text-xs text-white/60">{props.desc}</div>
        </div>
        <span className="text-white/50">↗</span>
      </a>
    );
  }

  return (
    <Link
      href={props.href}
      className="flex items-center justify-between gap-6 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 hover:bg-white/10"
    >
      <div>
        <div className="text-sm font-medium text-white/90">{props.name}</div>
        <div className="mt-1 text-xs text-white/60">{props.desc}</div>
      </div>
      <span className="text-white/50">→</span>
    </Link>
  );
}
