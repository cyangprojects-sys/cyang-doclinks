import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export const metadata: Metadata = {
  title: "Projects - cyang.io",
  description:
    "Explore the curated cyang.io project studio: maintained products, operational systems, and disciplined experiments led by the Doclinks flagship.",
};

type StudioStatus = "Live" | "Shipping" | "Experimental" | "Internal" | "Coming next";

type StudioProject = {
  name: string;
  summary: string;
  href: string;
  status: StudioStatus;
  category: string;
  tags: string[];
  cta: string;
  featured?: boolean;
};

type ShippingTrack = {
  title: string;
  body: string;
  items: string[];
};

const STUDIO_POSTURE = ["Maintained", "Security-first", "Fast UX", "Auditable", "Small surface area"];

const DOCLINKS_PILLARS = [
  "Secure sharing",
  "Server-side enforcement",
  "Audit trail",
  "Expiration and revocation",
  "Scan-first serving",
  "Minimal, predictable UX",
];

const PROJECTS: StudioProject[] = [
  {
    name: "Doclinks",
    summary:
      "Controlled external document delivery with enforceable policy checks, share lifecycle controls, and audit visibility.",
    href: "/projects/doclinks",
    status: "Live",
    category: "Flagship product",
    tags: ["Secure sharing", "Policy controls", "Auditability"],
    cta: "Open product",
    featured: true,
  },
  {
    name: "Operations reliability layer",
    summary:
      "Governance and reliability systems that keep policy behavior, incident handling, and service operation predictable.",
    href: "/trust",
    status: "Shipping",
    category: "Operations system",
    tags: ["Governance", "Operational clarity", "Service controls"],
    cta: "View trust architecture",
  },
  {
    name: "Security and Compliance Center",
    summary:
      "Policy, disclosure, retention, and legal surfaces designed for transparent customer trust and operational review.",
    href: "/legal",
    status: "Live",
    category: "Trust layer",
    tags: ["Legal docs", "Retention", "Disclosure"],
    cta: "Open trust center",
  },
  {
    name: "Status and Runtime Signals",
    summary:
      "Public-facing health and internal signals that keep product operation legible and measurable.",
    href: "/status",
    status: "Shipping",
    category: "Reliability",
    tags: ["Status", "Signals", "Operational clarity"],
    cta: "View status",
  },
  {
    name: "Automation Workbench",
    summary:
      "Focused automation utilities for repetitive operational tasks and future studio workflow acceleration.",
    href: "/about",
    status: "Experimental",
    category: "Studio experiment",
    tags: ["Automation", "Workflow", "Iteration"],
    cta: "Read approach",
  },
  {
    name: "Policy Guardrails Engine",
    summary:
      "Next-stage hardening around tenant controls, reporting depth, and lifecycle policies across the product surface.",
    href: "/projects/doclinks#security-model",
    status: "Coming next",
    category: "Roadmap",
    tags: ["Guardrails", "Controls", "Lifecycle"],
    cta: "View security model",
  },
];

const SHIPPING_TRACKS: ShippingTrack[] = [
  {
    title: "Shipping now",
    body: "Capabilities actively maturing in public product surfaces.",
    items: [
      "Doclinks share lifecycle and policy controls",
      "Operational governance tooling in workspace surfaces",
      "Status and trust-center pathways for customer transparency",
    ],
  },
  {
    title: "Recently hardened",
    body: "Areas that moved from useful to operationally durable.",
    items: [
      "Server-enforced access behavior and deterministic link states",
      "Audit-friendly usage and operational telemetry pathways",
      "Legal, policy, and disclosure pages aligned for public trust",
    ],
  },
  {
    title: "Current hardening focus",
    body: "What is being pressure-tested before broader expansion.",
    items: [
      "Lifecycle policy depth and guardrail coverage",
      "Admin workflow speed without reducing safety",
      "Future product lanes built on the same trust posture",
    ],
  },
];

export default function ProjectsPage() {
  const liveCount = PROJECTS.filter((project) => project.status === "Live").length;
  const activeCount = PROJECTS.filter((project) => project.status === "Live" || project.status === "Shipping").length;

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-12">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-sky-400/12 blur-3xl" />
          <div className="absolute -bottom-20 right-0 h-80 w-80 rounded-full bg-teal-300/12 blur-3xl" />
        </div>

        <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">Projects</span>

        <div className="mt-5 grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <h1 className="font-editorial max-w-5xl text-4xl leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Curated products, maintained systems, and deliberate experimentation.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-white/72 sm:text-lg">
              cyang.io projects are intentionally few and actively maintained. Each one is built for trustworthy operation,
              security-first defaults, and clear user experience under real usage.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/projects/doclinks" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
                Explore flagship
              </Link>
              <Link href="#gallery" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm font-medium">
                Browse all projects
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {STUDIO_POSTURE.map((item) => (
                <PostureChip key={item} label={item} />
              ))}
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="glass-card-strong rounded-3xl p-6">
              <div className="text-xs uppercase tracking-[0.14em] text-white/55">Studio snapshot</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <SnapshotStat label="Live projects" value={String(liveCount)} />
                <SnapshotStat label="Active shipping lanes" value={String(activeCount)} />
                <SnapshotStat label="Flagship focus" value="Doclinks" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="flagship" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Featured flagship"
          title="Doclinks is the lead product in the cyang.io studio."
          body="A premium, security-first document delivery product built for controlled sharing, reliable policy behavior, and predictable customer workflows."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-12">
          <div className="glass-card-strong ui-enterprise-grid rounded-3xl p-7 lg:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-white/55">Flagship product</div>
                <h3 className="mt-2 text-3xl font-semibold tracking-tight text-white">Doclinks</h3>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
                  Doclinks helps teams share sensitive external documents without losing control of access, lifecycle, or audit visibility.
                </p>
              </div>
              <StatusBadge status="Live" />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DOCLINKS_PILLARS.map((pillar) => (
                <Pillar key={pillar} label={pillar} />
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/projects/doclinks" className="btn-base btn-primary rounded-xl px-5 py-3 text-sm font-semibold">
                Open Doclinks
              </Link>
              <Link href="/signup" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                Create account
              </Link>
              <Link href="/pricing" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                Compare plans
              </Link>
              <Link href="/trust" className="btn-base btn-secondary rounded-xl px-5 py-3 text-sm">
                Review trust
              </Link>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 lg:col-span-4">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Flagship posture</div>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Built for real operations</h3>
            <ul className="mt-4 space-y-2">
              <Bullet>Purpose-built for controlled external delivery</Bullet>
              <Bullet>Secure defaults with server-side policy boundaries</Bullet>
              <Bullet>Audit trail and operational review visibility</Bullet>
              <Bullet>Fast, minimal UX with predictable user flow</Bullet>
            </ul>
            <Link
              href="/projects/doclinks#security-model"
              className="mt-6 inline-flex text-sm text-white/80 underline underline-offset-4 hover:text-white"
            >
              Review security model
            </Link>
          </div>
        </div>
      </section>

      <section id="gallery" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Project gallery"
          title="Studio projects and systems"
          body="Each project object includes status, category, key capabilities, and a clear next action so customers can scan quickly and decide where to go next."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PROJECTS.map((project) => (
            <ProjectCard key={project.name} project={project} />
          ))}
        </div>
      </section>

      <section id="shipping" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Now shipping"
          title="Product momentum and hardening"
          body="Transparent progress across what is shipping now, what has matured recently, and what is being hardened next."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {SHIPPING_TRACKS.map((track) => (
            <ShippingCard key={track.title} track={track} />
          ))}
        </div>
      </section>

      <section id="principles" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Why these projects matter"
          title="Built with product discipline"
          body="The cyang.io studio standard is practical trust: strong security posture, clear operations, high-performance UX, and controlled iteration."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <PrincipleCard
            short="SEC"
            title="Security posture"
            body="Controls are enforced in architecture, not delegated to user behavior."
          />
          <PrincipleCard
            short="OPS"
            title="Operational clarity"
            body="Products expose clear states, usable logs, and transparent operational pathways."
          />
          <PrincipleCard
            short="PERF"
            title="Performance"
            body="Fast pages and predictable interactions are baseline requirements, not stretch goals."
          />
          <PrincipleCard
            short="ITER"
            title="Iteration discipline"
            body="Small focused releases are validated, hardened, and expanded with intent."
          />
        </div>
      </section>

      <section className="mt-16 md:mt-20">
        <div className="glass-card rounded-3xl p-7">
          <SectionHeader
            eyebrow="Discovery"
            title="From useful tools to durable systems"
            body="cyang.io is evolving as a long-term studio: shipping practical products while building supporting systems that keep quality and trust high at every layer."
          />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <DiscoveryPanel
              title="What is actively being built"
              items={[
                "Customer-ready product surfaces with secure defaults",
                "Operational systems that reduce risk and ambiguity",
                "Reusable studio patterns for faster, safer future launches",
              ]}
            />
            <DiscoveryPanel
              title="What comes next"
              items={[
                "Expanded trust and governance pathways",
                "More product objects built on the same posture",
                "Tighter integrations between product, operations, and customer transparency",
              ]}
            />
          </div>
        </div>
      </section>

      <section id="actions" className="mt-16 md:mt-20">
        <SectionHeader
          eyebrow="Quick actions"
          title="Jump directly into what you need"
          body="Fast utility actions for product evaluation, account setup, and trust verification."
        />

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionTile href="/signup" title="Get started" body="Create an account and begin secure document delivery." />
          <ActionTile href="/projects/doclinks" title="Explore Doclinks" body="Review the flagship product and control surface." />
          <ActionTile href="/about" title="Read the approach" body="See how cyang.io builds with strict defaults and clarity." />
          <ActionTile href="/status" title="View status" body="Check platform health and operational transparency." />
        </div>
      </section>

      <section className="mt-16 mb-2 md:mt-20">
        <div className="glass-card-strong ui-sheen rounded-3xl p-7 sm:p-8">
          <div className="max-w-3xl">
            <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">Closing</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              These are real maintained products, not placeholders.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/72">
              Doclinks is the current flagship. More systems and tools are being built with the same security-first, operations-aware product philosophy.
            </p>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href="/projects/doclinks" className="btn-base btn-primary rounded-xl px-6 py-3 text-sm font-semibold">
              Go to Doclinks
            </Link>
            <Link href="/" className="btn-base btn-secondary rounded-xl px-6 py-3 text-sm">
              Return to cyang.io
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function SectionHeader(props: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-4xl">
      <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.15em]">{props.eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{props.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/72 sm:text-base">{props.body}</p>
    </div>
  );
}

function PostureChip({ label }: { label: string }) {
  return <span className="ui-badge rounded-full px-3 py-1.5 text-xs">{label}</span>;
}

function SnapshotStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/6 p-4">
      <div className="text-xs uppercase tracking-[0.1em] text-white/55">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{props.value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: StudioStatus }) {
  const styleByStatus: Record<StudioStatus, string> = {
    Live: "border-emerald-200/30 bg-emerald-300/10 text-emerald-100",
    Shipping: "border-sky-200/30 bg-sky-300/10 text-sky-100",
    Experimental: "border-violet-200/30 bg-violet-300/10 text-violet-100",
    Internal: "border-white/20 bg-white/10 text-white/80",
    "Coming next": "border-amber-200/30 bg-amber-300/10 text-amber-100",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${styleByStatus[status]}`}>
      {status}
    </span>
  );
}

function Pillar({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-4 text-sm font-medium text-white/90">
      {label}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-xs leading-relaxed text-white/70">
      <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-sky-200/70" />
      <span>{children}</span>
    </li>
  );
}

function ProjectCard({ project }: { project: StudioProject }) {
  const cardClassName = project.featured
    ? "glass-card-strong rounded-3xl p-6 transition-colors hover:bg-white/12"
    : "glass-card rounded-3xl p-6 transition-colors hover:bg-white/12";

  return (
    <Link href={project.href} className={cardClassName}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.12em] text-white/55">{project.category}</div>
        <StatusBadge status={project.status} />
      </div>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">{project.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{project.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span key={tag} className="ui-badge rounded-full px-2.5 py-1 text-[11px]">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-5 text-sm text-white/85">{project.cta}</div>
    </Link>
  );
}

function ShippingCard({ track }: { track: ShippingTrack }) {
  return (
    <div className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-semibold tracking-tight text-white">{track.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{track.body}</p>
      <ul className="mt-4 space-y-2">
        {track.items.map((item) => (
          <Bullet key={item}>{item}</Bullet>
        ))}
      </ul>
    </div>
  );
}

function PrincipleCard(props: { short: string; title: string; body: string }) {
  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="inline-flex rounded-lg border border-sky-200/30 bg-sky-300/10 px-2.5 py-1 text-[11px] font-semibold tracking-[0.1em] text-sky-100">
        {props.short}
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight text-white">{props.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.body}</p>
    </div>
  );
}

function DiscoveryPanel(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/25 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/75">{props.title}</h3>
      <ul className="mt-3 space-y-2">
        {props.items.map((item) => (
          <Bullet key={item}>{item}</Bullet>
        ))}
      </ul>
    </div>
  );
}

function ActionTile(props: { href: string; title: string; body: string; external?: boolean }) {
  if (props.external) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className="glass-card rounded-2xl p-5 transition-colors hover:bg-white/12"
        aria-label={`${props.title} (opens in a new tab)`}
      >
        <div className="text-sm font-medium text-white/92">{props.title}</div>
        <p className="mt-1 text-xs leading-relaxed text-white/64">{props.body}</p>
      </a>
    );
  }

  return (
    <Link href={props.href} className="glass-card rounded-2xl p-5 transition-colors hover:bg-white/12">
      <div className="text-sm font-medium text-white/92">{props.title}</div>
      <p className="mt-1 text-xs leading-relaxed text-white/64">{props.body}</p>
    </Link>
  );
}
