export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getOwnerOrNull } from "@/lib/owner";
import SharePanel from "./SharePanel";
import type { ShareRow } from "./actions";

type PageProps = {
  params: Promise<{ alias: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DocAliasPage({ params }: PageProps) {
  const { alias } = await params;

  // Resolve alias -> doc
  const docRows = await sql<{
    id: string;
    title: string | null;
    created_at: string;
    bucket: string | null;
    r2_key: string | null;
  }[]>`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      d.bucket,
      d.r2_key
    from doc_aliases da
    join docs d on d.id = da.doc_id
    where da.alias = ${alias}
    limit 1
  `;

  const doc = (docRows as any)[0];
  if (!doc) return notFound();

  const owner = await getOwnerOrNull();

  // Owner-only: load existing tokens (best-effort)
  let initialShares: ShareRow[] = [];
  if (owner) {
    try {
      const rows = await sql<ShareRow[]>`
        select
          token,
          to_email,
          created_at::text as created_at,
          expires_at::text as expires_at,
          max_views,
          view_count,
          revoked_at::text as revoked_at
        from share_tokens
        where doc_id = ${doc.id}::uuid
        order by created_at desc
        limit 50
      `;
      initialShares = (rows as any) ?? [];
    } catch {
      initialShares = [];
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">{doc.title || `${alias}.pdf`}</h1>
          <div className="mt-1 text-sm text-white/60">
            {doc.id}
          </div>
          <div className="mt-1 text-sm text-white/60">
            Created: {new Date(doc.created_at).toLocaleString()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
            href={`/d/${alias}/raw`}
          >
            Download
          </a>

          <Link className="text-sm text-white/70 hover:text-white" href="/admin">
            Admin
          </Link>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm text-white/70">Preview</div>
          <div className="text-xs text-white/40">{`/d/${alias}/raw`}</div>
        </div>

        <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10">
          <iframe
            title="preview"
            className="h-full w-full"
            src={`/d/${alias}/raw`}
          />
        </div>
      </div>

      {/* Owner controls */}
      {owner ? (
        <SharePanel
          docId={doc.id}
          alias={alias}
          docTitle={doc.title || "Document"}
          initialShares={initialShares}
        />
      ) : null}
    </main>
  );
}
