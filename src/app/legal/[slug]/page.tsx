import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PolicyPageShell } from "@/app/components/PolicyPageShell";
import {
  DocumentIndexList,
  Eyebrow,
  PremiumCard,
  Section,
} from "@/app/components/PublicPrimitives";
import { SiteShell } from "@/app/components/SiteShell";
import LegalTocNav from "@/app/legal/LegalTocNav";
import { MarkdownLegal } from "@/app/legal/MarkdownLegal";
import {
  LEGAL_CATEGORY_META,
  LEGAL_DOCS,
  extractLegalHeadings,
  getLegalDocBySlug,
  getRelatedLegalDocs,
  readLegalDocMarkdown,
} from "@/lib/legalDocs";

export const runtime = "nodejs";
export const dynamicParams = false;
export const revalidate = 3600;

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
  if (!doc) return { title: "Legal Center" };

  return {
    title: `${doc.title} | Legal Center`,
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

  if (index < lines.length && /^#\s+/.test(lines[index].trim())) index += 1;

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
      <PolicyPageShell
        breadcrumbs={[
          { label: "cyang.io", href: "/" },
          { label: "Legal Center", href: "/legal" },
          { label: doc.title },
        ]}
        eyebrow={categoryMeta.label}
        title={doc.title}
        body={doc.summary}
        actions={[
          { href: "/legal", label: "All documents", tone: "secondary" },
          { href: "/contact", label: "Contact", tone: "primary" },
        ]}
        meta={[
          { label: "Effective date", value: formatDate(doc.effectiveDate) },
          { label: "Last updated", value: formatDate(doc.lastUpdated) },
          { label: "Category", value: categoryMeta.label },
          { label: "Applies to", value: doc.appliesTo },
        ]}
        aside={
          <>
            <Eyebrow>At a glance</Eyebrow>
            <p className="mt-3 text-sm leading-7 text-white/62">{doc.atGlance}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {doc.badges.map((badge) => (
                <span key={badge} className="ui-badge rounded-full px-2.5 py-1 text-[11px]">
                  {badge}
                </span>
              ))}
            </div>
          </>
        }
      />

      <Section>
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <article className="surface-panel rounded-[2rem] p-6 sm:p-8">
              <MarkdownLegal markdown={bodyMarkdown} />
            </article>
          </div>

          <div className="space-y-4 lg:col-span-4">
            <LegalTocNav headings={headings} />

            <PremiumCard>
              <Eyebrow>Need help?</Eyebrow>
              <p className="mt-3 text-sm leading-7 text-white/62">
                For procurement, privacy, or security clarification, use the documented contact route below.
              </p>
              <a href={`mailto:${doc.primaryContact}`} className="mt-4 inline-flex text-sm text-white/84 underline underline-offset-4 hover:text-white">
                {doc.primaryContact}
              </a>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/56">
                <Link href="/report" className="underline underline-offset-4 hover:text-white">Report abuse</Link>
                <Link href="/security-disclosure" className="underline underline-offset-4 hover:text-white">Security disclosure</Link>
              </div>
            </PremiumCard>
          </div>
        </div>
      </Section>

      <Section>
        <div className="max-w-3xl">
          <Eyebrow>Related documents</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            Continue the legal review without losing context.
          </h2>
        </div>
        <div className="mt-8">
          <DocumentIndexList
            items={[
              ...relatedDocs.map((related) => ({
                href: `/legal/${related.slug}`,
                title: related.title,
                body: related.summary,
              })),
              {
                href: "/legal",
                title: "All legal documents",
                body: "Return to the main legal center index.",
              },
            ]}
          />
        </div>
      </Section>
    </SiteShell>
  );
}
