import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AliasRow = {
  alias: string;
  doc_id: string;
  revoked_at: string | null;
  expires_at: string | null;
};

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

export default async function SharePage({
  params,
}: {
  params: { alias: string };
}) {
  const alias = (params.alias || "").trim();
  if (!alias) notFound();

  // Fetch the row without relying on date filtering in SQL (more robust across schema tweaks)
  const rows = (await sql`
    select
      alias::text as alias,
      doc_id::text as doc_id,
      revoked_at::text as revoked_at,
      expires_at::text as expires_at
    from public.doc_aliases
    where alias = ${alias}
    limit 1
  `) as AliasRow[];

  const row = rows?.[0];
  if (!row?.doc_id) notFound();

  const revoked = !!row.revoked_at;
  const expired = isExpired(row.expires_at);

  // If revoked or expired, show a friendly page (no hard 404)
  if (revoked || expired) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-white">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Shared document</h1>
          <Link
            href="/"
            className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
          >
            Home
          </Link>
        </div>

        <p className="mt-2 text-sm text-neutral-400">
          Link: <span className="font-mono text-neutral-300">/d/{alias}</span>
        </p>

        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/40 p-5">
          <div className="text-lg font-medium">
            {revoked ? "This link has been revoked." : "This link has expired."}
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            If you believe this is a mistake, contact the sender for a new link.
          </p>
        </div>
      </main>
    );
  }

  const docId = row.doc_id;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Shared document</h1>
        <Link
          href="/"
          className="text-sm text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
        >
          Home
        </Link>
      </div>

      <p className="mt-2 text-sm text-neutral-400">
        Link: <span className="font-mono text-neutral-300">/d/{alias}</span>
      </p>

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
        <ShareForm docId={docId} alias={alias} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-800">
        {/* This endpoint logs views + redirects to a signed R2 URL */}
        <iframe
          title="Document"
          src={`/d/${encodeURIComponent(alias)}/raw`}
          className="h-[80vh] w-full"
        />
      </div>
    </main>
  );
}
