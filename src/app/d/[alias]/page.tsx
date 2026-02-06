import "server-only";

import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function resolveDocId(alias: string): Promise<string | null> {
  // Optional alias mapping (ignore if table doesn't exist)
  try {
    const rows = await sql<{ doc_id: string }[]>`
      select doc_id::text as doc_id
      from doc_aliases
      where alias = ${alias}
        and is_active = true
      limit 1
    `;
    if (rows[0]?.doc_id) return rows[0].doc_id;
  } catch {
    // no-op
  }

  // Fallback: accept direct /d/<uuid>
  if (isUuid(alias)) {
    const rows = await sql<{ id: string }[]>`
      select id::text as id
      from documents
      where id = ${alias}::uuid
      limit 1
    `;
    if (rows[0]?.id) return rows[0].id;
  }

  return null;
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  const { alias } = await params;

  const docId = await resolveDocId(alias);
  if (!docId) notFound();

  // ✅ Fetch the document title for display
  const rows = await sql<{ title: string | null }[]>`
    select title
    from documents
    where id = ${docId}::uuid
    limit 1
  `;
  const title = (rows[0]?.title || "").trim() || "Untitled document";

  const downloadHref = `/api/doc/open?doc=${encodeURIComponent(docId)}`;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">cyang-doclinks</h1>
        <p className="text-sm opacity-70">Private document access</p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm opacity-70">Document</div>

            {/* ✅ Show title instead of UUID */}
            <div className="mt-1 text-base font-semibold">{title}</div>

            {/* Optional: keep doc id visible but subtle */}
            <div className="mt-1 font-mono text-xs break-all opacity-50">{docId}</div>

            <div className="mt-2 text-xs opacity-60">
              Click to open the PDF (served from R2).
            </div>
          </div>

          <a
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black whitespace-nowrap"
            href={downloadHref}
          >
            Download / Open PDF
          </a>
        </div>
      </div>
    </main>
  );
}
