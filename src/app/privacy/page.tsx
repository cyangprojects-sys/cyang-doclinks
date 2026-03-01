import Link from "next/link";
import { SiteShell } from "@/app/components/SiteShell";
import { MarkdownLegal } from "@/app/legal/MarkdownLegal";
import { readLegalDocMarkdown } from "@/lib/legalDocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const markdown = await readLegalDocMarkdown("PRIVACY_POLICY.md");

  return (
    <SiteShell maxWidth="full">
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-white/60">cyang.io</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Privacy Policy</h1>
            <div className="mt-2 text-sm text-white/60">Source: docs/PRIVACY_POLICY.md</div>
          </div>
          <Link href="/legal" className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
            Legal Center
          </Link>
        </div>

        <article className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <MarkdownLegal markdown={markdown} />
        </article>
      </main>
    </SiteShell>
  );
}

