import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AliasRow = { doc_id: string };

export default async function SharePage({
  params,
}: {
  params: { alias: string };
}) {
  const alias = decodeURIComponent(params.alias || "").trim();
  if (!alias) notFound();

  const rows = (await sql`
    select doc_id::text as doc_id
    from public.doc_aliases
    where alias = ${alias}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `) as AliasRow[];

  const docId = rows?.[0]?.doc_id;
  if (!docId) notFound();

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
        <ShareForm docId={docId} />
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
