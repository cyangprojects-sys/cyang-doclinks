// app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "./components/SiteShell";

export const metadata: Metadata = {
  title: "cyang.io — Chang Yang",
  description:
    "Chang Yang’s personal hub: practical projects, experiments, and a security-first document sharing tool called Doclinks.",
};

export default function HomePage() {
  const exampleMagicLink = "/d/welcome";

  return (
    <SiteShell maxWidth="6xl">
      {/* Hero */}
      <section className="relative mt-20 md:mt-28">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="grid gap-12 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Chang’s personal hub • security-first builds
            </p>

            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Build in public.
              <span className="block text-white/70">Ship like a security team is watching.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70">
              cyang.io is my home base — a small set of maintained projects that ship
              quickly without getting sloppy. The theme is consistent: minimal UI,
              strict defaults, and security where it matters.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/projects"
                className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90"
              >
                View projects
              </Link>

              <Link
                href="/projects/doclinks"
                className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
              >
                Explore Doclinks →
              </Link>

              <Link
                href={exampleMagicLink}
                className="rounded-2xl px-6 py-3 text-sm font-medium text-white/70 hover:text-white"
              >
                Open example magic link →
              </Link>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              <Stat title="Build style" value="Small & reliable" />
              <Stat title="Default posture" value="Secure-first" />
              <Stat title="Focus" value="Fast UX" />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 text-xs text-white/60">
              <TrustPill>Server-side enforcement</TrustPill>
              <TrustPill>Audit logs</TrustPill>
              <TrustPill>Rate limits</TrustPill>
              <TrustPill>R2 private objects</TrustPill>
              <TrustPill>Postgres-backed policies</TrustPill>
            </div>
          </div>

          {/* Featured card */}
          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-sm font-medium text-white/90">Featured</h2>

              <div className="mt-4 rounded-2xl bg-black/40 p-5 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Doclinks</div>
                <div className="mt-1 text-lg font-semibold">Secure document sharing</div>
                <p className="mt-2 text-sm text-white/70">
                  Upload PDFs and share them via short links backed by R2 storage, server-side
                  access checks, and audit logging.
                </p>

                <div className="mt-4 flex gap-3">
                  <Link
                    href="/admin"
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
                  >
                    Upload
                  </Link>
                  <Link
                    href="/projects/doclinks"
                    className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
                  >
                    Learn more
                  </Link>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <InfoPill title="Status" value="Live on Vercel" />
                <InfoPill
                  title="Health"
                  value={
                    <Link href="/api/health" className="text-white hover:underline">
                      /api/health
                    </Link>
                  }
                />
              </div>

              <div className="mt-5 rounded-2xl bg-black/40 p-5 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Positioning</div>
                <div className="mt-1 text-sm font-medium text-white/90">
                  DocSend-level UX, with a smaller surface area.
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/60">
                  Designed to be easy for viewers and hard to misuse: server checks, limits,
                  and clean failure modes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick sections */}
      <section className="mt-24 md:mt-32">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Start here</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
              A quick path to the main things on the site.
            </p>
          </div>

          <Link
            href="/about"
            className="hidden rounded-2xl bg-white/5 px-4 py-2 text-sm text-white/80 ring-1 ring-white/10 hover:bg-white/10 sm:inline-flex"
          >
            Read the approach →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MiniCard
            title="Projects"
            desc="A curated list of things I maintain and iterate on."
            href="/projects"
            cta="Browse projects →"
          />
          <MiniCard
            title="Doclinks"
            desc="Short links for PDFs with strict access checks and audit logs."
            href="/projects/doclinks"
            cta="See Doclinks →"
          />
          <MiniCard
            title="Tools"
            desc="Upload documents, manage shares, and review access logs."
            href="/admin"
            cta="Open tools →"
          />
        </div>
      </section>

      {/* Principles */}
      <section className="mt-16 md:mt-24">
        <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <div className="grid gap-8 md:grid-cols-12 md:items-center">
            <div className="md:col-span-7">
              <h2 className="text-2xl font-semibold tracking-tight">Principles</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                I try to keep the surface area small, make the safe path the easy path,
                and build UI that feels instant.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Bullet
                  title="Security by default"
                  desc="Server-side gating, sane limits, and predictable behavior."
                />
                <Bullet
                  title="Operational clarity"
                  desc="Audit trails, simple admin tools, and clean failure modes."
                />
                <Bullet title="Boring tech wins" desc="Next.js, Postgres, R2, Vercel." />
                <Bullet title="Iterate fast" desc="Ship small, measure, improve." />
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="rounded-2xl bg-black/40 p-5 ring-1 ring-white/10">
                <div className="text-xs text-white/60">Try it</div>
                <div className="mt-1 text-lg font-semibold">Open a sample link</div>
                <p className="mt-2 text-sm text-white/70">
                  If a document is shared, it can be opened via a short URL like{" "}
                  <span className="text-white/80">{exampleMagicLink}</span>.
                </p>
                <div className="mt-4">
                  <Link
                    href={exampleMagicLink}
                    className="inline-flex rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
                  >
                    Open example →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why this exists */}
      <section className="mt-16 md:mt-24">
        <div className="grid gap-4 md:grid-cols-12">
          <div className="md:col-span-7">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h2 className="text-2xl font-semibold tracking-tight">Why cyang.io</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                I want the site to read like a small product studio: a handful of tools that
                stay maintained, get safer over time, and feel professional to use.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Bullet
                  title="Better than “link secrecy”"
                  desc="Doclinks treats links as convenience, not security — enforcement happens server-side."
                />
                <Bullet
                  title="Operational confidence"
                  desc="Audit trails, rate limits, and predictable policies help you trust what’s live."
                />
                <Bullet
                  title="Performance as a feature"
                  desc="Fast pages, minimal JS, and tight UI so the product stays snappy."
                />
                <Bullet
                  title="Security-first roadmap"
                  desc="Smaller surface area, stronger controls, and gradual hardening over time."
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
              <h3 className="text-sm font-medium text-white/90">Next steps</h3>
              <div className="mt-4 space-y-3">
                <NextStep title="Try Doclinks" desc="Upload a PDF and generate a short link." href="/admin" />
                <NextStep
                  title="Read the product page"
                  desc="Understand the access model and controls."
                  href="/projects/doclinks"
                />
                <NextStep
                  title="See the project list"
                  desc="A curated set of maintained builds."
                  href="/projects"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-xs text-white/60">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function InfoPill(props: { title: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-xs text-white/60">{props.title}</div>
      <div className="mt-1 text-sm text-white/80">{props.value}</div>
    </div>
  );
}

function Bullet(props: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="text-sm font-medium text-white/90">{props.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
    </div>
  );
}

function MiniCard(props: { title: string; desc: string; href: string; cta: string }) {
  return (
    <Link
      href={props.href}
      className="group rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/10"
    >
      <div className="text-lg font-semibold">{props.title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.desc}</p>
      <div className="mt-4 text-sm text-white/80 group-hover:text-white">{props.cta}</div>
    </Link>
  );
}

function TrustPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-white/60 ring-1 ring-white/10">
      {children}
    </span>
  );
}

function NextStep(props: { title: string; desc: string; href: string }) {
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
