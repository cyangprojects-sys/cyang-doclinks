// src/app/d/[alias]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { isOwnerAdmin } from "@/lib/admin";
import SharePanel from "./SharePanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  title: string | null;
  created_at: string;
  alias: string;
};

type ShareRow = {
  token: string;
  to_email: string | null;
  created_at: string;
  expires_at: string | null;
  max_views: number | null;
  view_count: number | null;
  revoked_at: string | null;
};

function fmtDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

export default async function DocAliasPage({
  params,
}: {
  params: Promise<{ alias: string }>;
}) {
  const { alias } = await params;

  const rows = (await sql`
    select
      d.id::text as id,
      d.title,
      d.created_at::text as created_at,
      a.alias
    from doc_aliases a
    join docs d on d.id = a.doc_id
    where a.alias = ${alias}
    limit 1
  `) as unknown as DocRow[];

  const doc = rows[0];
  if (!doc) notFound();

  const owner = await isOwnerAdmin();

  const shares = owner
    ? ((await sql`
        select
          token::text as token,
          to_email,
          created_at::text as created_at,
          expires_at::text as expires_at,
          max_views,
          view_count,
          revoked_at::text as revoked_at
        from doc_shares
        where doc_id = ${doc.id}::uuid
        order by created_at desc
        limit 50
      `) as unknown as ShareRow[])
    : [];

  const initialShares = shares.map((s) => ({
    token: s.token,
    to_email: s.to_email,
    created_at: s.created_at,
    expires_at: s.expires_at,
    max_views: s.max_views,
    view_count: Number(s.view_count ?? 0),
    revoked_at: s.revoked_at,
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {doc.title || "Untitled"}
          </h1>
          <div className="mt-1 text-xs text-neutral-500 font-mono">
            {doc.id}
          </div>
          <div className="mt-2 text-sm text-neutral-400">
            Created: {fmtDate(doc.created_at)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/d/${doc.alias}/raw?download=1`}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Download
          </Link>

          {owner ? (
            <Link
              href="/admin/dashboard"
              className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
            >
              Admin
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-neutral-800 bg-black/20">
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-950">
          <div className="text-sm font-medium text-neutral-200">Preview</div>
          <div className="text-xs text-neutral-500">/d/{doc.alias}/raw</div>
        </div>

        <div className="h-[75vh]">
          <iframe
            title="Document preview"
            src={`/d/${doc.alias}/raw`}
            className="h-full w-full"
          />
        </div>
      </div>

      {owner ? (
        <SharePanel alias={doc.alias} docTitle={doc.title || "Document"} initialShares={initialShares} />
      ) : null}
    </main>
  );
}
