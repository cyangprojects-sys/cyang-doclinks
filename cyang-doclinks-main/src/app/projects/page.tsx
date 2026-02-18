// app/projects/page.tsx
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export default function ProjectsPage() {
    return (
        <SiteShell maxWidth="6xl">
            <section className="mt-16">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Projects
                </p>

                <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
                    Working projects & experiments
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
                    This is the “mixed” part of cyang.io: a small set of projects that
                    stay maintained, plus experiments that evolve or disappear.
                </p>

                <div className="mt-10 grid gap-4 md:grid-cols-3">
                    <ProjectCard
                        title="Doclinks"
                        label="Primary"
                        desc="Secure document sharing via short links, backed by R2 + DB gating."
                        href="/projects/doclinks"
                        cta="Open Doclinks →"
                    />

                    <ProjectCard
                        title="Automation Tools"
                        label="Ops"
                        desc="Workflow helpers and utilities that remove friction and save time."
                        href="/about"
                        cta="About my approach →"
                    />

                    <ProjectCard
                        title="Experiments"
                        label="Lab"
                        desc="UI prototypes, small MVPs, and learning builds that ship fast."
                        href="/about"
                        cta="Why this exists →"
                    />
                </div>

                <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                    <h2 className="text-lg font-semibold">Quick links</h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <QuickLink
                            name="Upload a document"
                            desc="Create a doc and get a shareable magic link."
                            href="/admin"
                        />
                        <QuickLink
                            name="Open an example magic link"
                            desc="Try /d/welcome (swap to your real alias anytime)."
                            href="/d/welcome"
                        />
                    </div>
                </div>
            </section>
        </SiteShell>
    );
}

function ProjectCard(props: {
    title: string;
    label: string;
    desc: string;
    href: string;
    cta: string;
}) {
    return (
        <Link
            href={props.href}
            className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 hover:bg-white/10"
        >
            <div className="text-xs text-white/60">{props.label}</div>
            <div className="mt-2 text-lg font-semibold">{props.title}</div>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{props.desc}</p>
            <div className="mt-4 text-sm text-white/80">{props.cta}</div>
        </Link>
    );
}

function QuickLink(props: { name: string; desc: string; href: string }) {
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
