// app/page.tsx
import Link from "next/link";
import { SiteShell } from "./components/SiteShell";

export default function HomePage() {
  const exampleMagicLink = "/d/welcome";

  return (
    <SiteShell maxWidth="6xl">
      {/* Hero */}
      <section className="mt-20 md:mt-28 grid gap-12 md:grid-cols-12 md:items-end">
        <div className="md:col-span-7">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Chang’s personal hub
          </p>

          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Hi, I’m Chang Yang.
            <span className="block text-white/70">I build useful tools.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70">
            cyang.io is my home base — a mix of working projects, experiments,
            and tools I actually use. Clean, minimal, and maintained.
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
              Doclinks →
            </Link>

            <Link
              href={exampleMagicLink}
              className="rounded-2xl px-6 py-3 text-sm font-medium text-white/70 hover:text-white"
            >
              Open example magic link →
            </Link>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Stat title="Projects" value="Practical builds" />
            <Stat title="Tools" value="Use right now" />
            <Stat title="Lab" value="Fast iterations" />
          </div>
        </div>

        {/* Featured card */}
        <div className="md:col-span-5">
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <h2 className="text-sm font-medium text-white/90">Featured</h2>

            <div className="mt-4 rounded-2xl bg-black/40 p-5 ring-1 ring-white/10">
              <div className="text-xs text-white/60">Doclinks</div>
              <div className="mt-1 text-lg font-semibold">
                Secure document sharing
              </div>
              <p className="mt-2 text-sm text-white/70">
                Upload PDFs and share them via short links backed by R2 +
                server-side access checks.
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

            <div className="mt-5 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-xs text-white/60">Status</div>
              <div className="mt-1 text-sm text-white/80">
                Live on Vercel • Health:{" "}
                <Link href="/api/health" className="text-white hover:underline">
                  /api/health
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick sections */}
      <section className="mt-24 md:mt-32 grid gap-4 md:grid-cols-3">
        <MiniCard
          title="Projects"
          desc="A curated list of things I maintain."
          href="/projects"
          cta="Browse projects →"
        />
        <MiniCard
          title="Tools"
          desc="Useful endpoints and pages on this site."
          href="/admin"
          cta="Open tools →"
        />
        <MiniCard
          title="About"
          desc="Why this site exists and how I build."
          href="/about"
          cta="Read about →"
        />
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

function MiniCard(props: { title: string; desc: string; href: string; cta: string }) {
  return (
    <Link
      href={props.href}
      className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/10"
    >
      <div className="text-lg font-semibold">{props.title}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{props.desc}</p>
      <div className="mt-4 text-sm text-white/80">{props.cta}</div>
    </Link>
  );
}
