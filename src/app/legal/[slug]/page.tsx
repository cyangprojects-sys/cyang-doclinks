import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteShell } from "@/app/components/SiteShell";
import { MarkdownLegal } from "@/app/legal/MarkdownLegal";
import LegalTocNav from "@/app/legal/LegalTocNav";
import {
  LEGAL_CATEGORY_META,
  LEGAL_DOCS,
  extractLegalHeadings,
  getLegalDocBySlug,
  getRelatedLegalDocs,
  readLegalDocMarkdown,
} from "@/lib/legalDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDocBySlug(slug);
  if (!doc) {
    return {
      title: "Legal and Trust Center",
    };
  }

  return {
    title: `${doc.title} | Legal and Trust Center`,
    description: doc.summary,
    alternates: {
      canonical: `/legal/${doc.slug}`,
    },
  };
}

function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function normalizeLegalBody(markdown: string): string {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  if (!lines.length) return "";

  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;

  if (index < lines.length && /^#\s+/.test(lines[index].trim())) {
    index += 1;
  }

  while (
    index < lines.length &&
    (/^effective date:/i.test(lines[index].trim()) ||
      /^last updated:/i.test(lines[index].trim()) ||
      !lines[index].trim())
  ) {
    index += 1;
  }

  return lines.slice(index).join("\n").trim();
}

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getLegalDocBySlug(slug);
  if (!doc) notFound();

  let markdown = "";
  try {
    markdown = await readLegalDocMarkdown(doc.file);
  } catch {
    notFound();
  }

  const bodyMarkdown = normalizeLegalBody(markdown);
  const headings = extractLegalHeadings(bodyMarkdown);
  const relatedDocs = getRelatedLegalDocs(doc.slug);
  const categoryMeta = LEGAL_CATEGORY_META[doc.category];

  return (
    <SiteShell maxWidth="full">
      <section className="relative mt-10">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <div className="text-xs uppercase tracking-[0.14em] text-white/48">
              <Link href="/legal" className="hover:text-white/82">
                Legal and Trust Center
              </Link>
              <span className="mx-2 text-white/38">/</span>
              <span className="text-white/60">{doc.title}</span>
            </div>
            <span className="ui-badge inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em]">
              {categoryMeta.label}
            </span>
            <h1 className="font-editorial mt-5 max-w-5xl text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {doc.title}
            </h1>
            <p className="mt-6 max-w-4xl text-base leading-relaxed text-white/72 sm:text-lg">{doc.summary}</p>
          </div>

          <div className="lg:col-span-4">
            <div className="glass-card-strong rounded-3xl p-5">
              <div className="text-xs uppercase tracking-[0.14em] text-white/55">Document metadata</div>
              <dl className="mt-3 grid gap-2 text-xs text-white/65">
                <div>
                  <dt className="uppercase tracking-[0.1em] text-white/50">Effective date</dt>
                  <dd className="mt-0.5 text-white/78">{formatDate(doc.effectiveDate)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.1em] text-white/50">Last updated</dt>
                  <dd className="mt-0.5 text-white/78">{formatDate(doc.lastUpdated)}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.1em] text-white/50">Category</dt>
                  <dd className="mt-0.5 text-white/78">{categoryMeta.label}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-[0.1em] text-white/50">Applies to</dt>
                  <dd className="mt-0.5 text-white/78">{doc.appliesTo}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/legal" className="btn-base btn-secondary rounded-lg px-3 py-1.5 text-xs">
                  All legal docs
                </Link>
                <Link href="/report" className="btn-base btn-secondary rounded-lg px-3 py-1.5 text-xs">
                  Report abuse
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="glass-card rounded-3xl p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-white">At a glance</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/72">{doc.atGlance}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {doc.badges.map((badge) => (
              <span key={badge} className="ui-badge rounded-full px-2.5 py-1 text-[11px]">
                {badge}
              </span>
            ))}
            {relatedDocs.map((related) => (
              <Link key={related.slug} href={`/legal/${related.slug}`} className="ui-badge rounded-full px-2.5 py-1 text-[11px]">
                Related: {related.title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <article className="glass-card rounded-3xl p-6 sm:p-8 print:rounded-none print:border-none print:bg-white print:text-black">
            <MarkdownLegal markdown={bodyMarkdown} />
          </article>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <LegalTocNav headings={headings} />

          <div className="glass-card rounded-2xl p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-white/55">Need help?</div>
            <p className="mt-2 text-xs leading-relaxed text-white/68">
              Contact the legal and trust team if you need clarification for procurement, privacy, or security review.
            </p>
            <a href={`mailto:${doc.primaryContact}`} className="mt-3 inline-flex text-sm text-white/85 underline underline-offset-4 hover:text-white">
              {doc.primaryContact}
            </a>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Link href="/report" className="text-white/75 underline hover:text-white">Report abuse</Link>
              <Link href="/security-disclosure" className="text-white/75 underline hover:text-white">Security disclosure</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12 mb-2">
        <div className="glass-card-strong rounded-3xl p-6 sm:p-7">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Related documents</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Explore policies connected to this document for a complete legal and trust view.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {relatedDocs.map((related) => (
              <Link key={related.slug} href={`/legal/${related.slug}`} className="rounded-2xl border border-white/12 bg-black/25 p-4 transition-colors hover:bg-white/10">
                <div className="text-sm font-medium text-white/92">{related.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-white/64">{related.summary}</div>
              </Link>
            ))}
            <Link href="/legal" className="rounded-2xl border border-white/12 bg-black/25 p-4 transition-colors hover:bg-white/10">
              <div className="text-sm font-medium text-white/92">All legal documents</div>
              <div className="mt-1 text-xs leading-relaxed text-white/64">Return to the legal and trust center.</div>
            </Link>
          </div>
          {relatedDocs.length === 0 ? (
            <p className="mt-4 text-xs text-white/58">
              No directly related documents are mapped yet. Use the Legal and Trust Center for the full index.
            </p>
          ) : null}
        </div>
      </section>
    </SiteShell>
  );
}
