import Link from "next/link";
import { SiteShell } from "@/app/components/SiteShell";
import { LEGAL_DOCS } from "@/lib/legalDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LegalIndexPage() {
  return (
    <SiteShell maxWidth="full">
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">cyang.io</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Legal Center</h1>
            <p className="mt-2 text-sm text-white/60">
              Canonical legal documents synced from the repository <code className="text-white/80">docs/</code> folder.
            </p>
          </div>
          <Link href="/" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
            Home
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {LEGAL_DOCS.map((doc) => (
            <Link
              key={doc.slug}
              href={`/legal/${doc.slug}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
            >
              <div className="text-base font-semibold text-white">{doc.title}</div>
              <div className="mt-1 text-sm text-white/65">{doc.summary}</div>
            </Link>
          ))}
        </div>
      </main>
    </SiteShell>
  );
}

