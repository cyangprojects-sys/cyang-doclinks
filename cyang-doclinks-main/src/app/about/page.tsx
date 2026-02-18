// app/about/page.tsx
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export default function AboutPage() {
    return (
        <SiteShell maxWidth="4xl">
            <section className="mt-16">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    About
                </p>

                <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
                    Hi, I’m Chang Yang.
                </h1>

                <p className="mt-6 text-base leading-relaxed text-white/70">
                    I build useful tools—mostly the kind that makes day-to-day life and work
                    feel smoother. cyang.io is my personal hub: a place to host working
                    projects, small experiments, and utilities I actually use.
                </p>

                <div className="mt-10 grid gap-4 md:grid-cols-2">
                    <Card
                        title="What I like building"
                        items={[
                            "Simple tools with strong UX",
                            "Automation that removes friction",
                            "Secure sharing and clean access control",
                            "Projects that ship fast and improve over time",
                        ]}
                    />
                    <Card
                        title="How I build"
                        items={[
                            "Start minimal → iterate quickly",
                            "Prefer boring tech that scales",
                            "Make the useful thing easy to use",
                            "Keep the surface area small and maintainable",
                        ]}
                    />
                </div>

                <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                    <h2 className="text-lg font-semibold">What’s on this site</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/70">
                        You’ll find a mix of pages. Some are “public-facing” (projects, writeups).
                        Some are tools (doc upload, magic links). The point is not to be big—
                        it’s to be useful.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Tag>Next.js</Tag>
                        <Tag>Vercel</Tag>
                        <Tag>Cloudflare R2</Tag>
                        <Tag>Postgres</Tag>
                        <Tag>Magic Links</Tag>
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

function Card({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-lg font-semibold">{title}</div>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
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
