import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/app/components/SiteShell";
import { MarkdownLegal } from "@/app/legal/MarkdownLegal";
import { LEGAL_DOCS, getLegalDocBySlug, readLegalDocMarkdown } from "@/lib/legalDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return LEGAL_DOCS.map((doc) => ({ slug: doc.slug }));
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

  return (
    <SiteShell maxWidth="full">
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">Legal document</div>
            <div className="mt-1 text-lg font-semibold text-white">{doc.title}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/legal" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
              All legal docs
            </Link>
            <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
              Home
            </Link>
          </div>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <MarkdownLegal markdown={markdown} />
        </article>
      </main>
    </SiteShell>
  );
}

