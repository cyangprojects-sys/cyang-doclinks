import Link from "next/link";
import { notFound } from "next/navigation";

import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AliasRow = { doc_id: string };

type Props = {
  params: { alias: string };
};

export default async function DocAliasPage({ params }: Props) {
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

  const rawHref = `/d/${encodeURIComponent(alias)}/raw`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shared document</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link className="underline opacity-80 hover:opacity-100" href={rawHref}>
            Open raw
          </Link>
          <Link className="underline opacity-80 hover:opacity-100" href="/">
            Home
          </Link>
        </div>
      </div>

      <p className="mt-2 text-sm opacity-70 break-all">Alias: {alias}</p>

      <div className="mt-6 rounded-lg border p-4">
        {/* ShareForm only accepts { docId } */}
        <ShareForm docId={docId} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border">
        <iframe
          title={alias}
          src={rawHref}
          className="h-[75vh] w-full"
          referrerPolicy="no-referrer"
        />
      </div>
    </main>
  );
}
