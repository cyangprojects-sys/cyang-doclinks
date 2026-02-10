// app/projects/doclinks/page.tsx
import Link from "next/link";
import { SiteShell } from "../../components/SiteShell";

export default function DoclinksPage() {
    const exampleAlias = "/d/welcome";

    return (
        <SiteShell maxWidth="6xl">
            <section className="mt-16 grid gap-10 md:grid-cols-12 md:items-end">
                <div className="md:col-span-7">
                    <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-xs text-white/70 ring-1 ring-white/10">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Project: Doclinks
                    </p>

                    <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
                        Secure document sharing
                        <span className="block text-white/70">with short, usable links.</span>
                    </h1>

                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
                        Doclinks is a small system for uploading PDFs and sharing them via
                        friendly URLs. It’s designed to be simple for users and strict
                        about access behind the scenes (storage + gating + safe defaults).
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Link
                            href="/admin/upload"
                            className="rounded-2xl bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90"
                        >
                            Upload a PDF
                        </Link>

                        <Link
                            href={exampleAlias}
                            className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/15"
                        >
                            Try an example link
                        </Link>
                    </div>

                    <div className="mt-10 grid gap-4 sm:grid-cols-3">
                        <Stat title="Storage" value="Cloudflare R2" />
                        <Stat title="Gating" value="DB + server checks" />
                        <Stat title="UX" value="Fast, minimal, clean" />
                    </div>
                </div>

                <div className="md:col-span-5">
                    <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                        <h2 className="text-sm font-medium text-white/90">How it works</h2>

                        <div className="mt-4 space-y-3">
                            <Step
                                n="1"
                                title="Upload"
                                desc="Admin uploads a PDF to R2 and stores metadata + pointers."
                            />
                            <Step
                                n="2"
                                title="Share"
                                desc="A short link (/d/<id> or /d/<alias>) is distributed."
                            />
                            <Step
                                n="3"
                                title="Gate"
                                desc="Server checks access rules before returning the file."
                            />
                        </div>

                        <div className="mt-6 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
                            <p className="text-xs text-white/60">
                                Swap <span className="text-white/80">{exampleAlias}</span> to any
                                real alias you’ve created in your doc table.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-20 md:mt-28">
                <h2 className="text-2xl font-semibold tracking-tight">Design goals</h2>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <Feature
                        title="Small surface area"
                        desc="Minimal pages, minimal endpoints, and predictable behavior."
                    />
                    <Feature
                        title="Secure by default"
                        desc="Always gate access server-side; clamp inputs; avoid surprises."
                    />
                    <Feature
                        title="Feels instant"
                        desc="Fast load, clean UI, and links that people can actually use."
                    />
                </div>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight">Use it</h2>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <Callout
                        title="Admin upload"
                        desc="Upload PDFs and generate a shareable link."
                        href="/admin/upload"
                        cta="Open Admin Upload →"
                    />
                    <Callout
                        title="Open a document"
                        desc="Use /d/<docId> or /d/<alias> to retrieve a document."
                        href={exampleAlias}
                        cta="Try an example →"
                    />
                </div>
            </section>

            <section className="mt-16">
                <h2 className="text-2xl font-semibold tracking-tight">Roadmap</h2>
                <div className="mt-6 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                    <ul className="space-y-3 text-sm text-white/70">
                        <li className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
                            <span>Better alias management UI (create/rename/expire)</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
                            <span>Access policies (time-limited, allowlists, one-time links)</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-white/30" />
                            <span>Audit trail + lightweight analytics (views, referrers)</span>
                        </li>
                    </ul>
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

function Step(props: { n: string; title: string; desc: string }) {
    return (
        <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="flex items-start gap-3">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-xs font-semibold ring-1 ring-white/10">
                    {props.n}
                </div>
                <div>
                    <div className="text-sm font-medium text-white/90">{props.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/60">{props.desc}</div>
                </div>
            </div>
        </div>
    );
}

function Feature({ title, desc }: { title: string; desc: string }) {
    return (
        <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="text-lg font-semibold">{title}</div>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
        </div>
    );
}

function Callout(props: { title: string; desc: string; href: string; cta: string }) {
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
