import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ alias: string }>;
};

type AliasRow = { doc_id: string };

function cleanAlias(raw: string) {
  // Next usually decodes already, but keep it safe.
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return (raw || "").trim();
  }
}

export default async function AliasPage({ params }: Props) {
  const { alias: rawAlias } = await params;
  const alias = cleanAlias(rawAlias);

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

  // This loads the PDF through your existing /d/[alias]/raw route (which redirects to /serve/:docId)
  const rawUrl = `/d/${encodeURIComponent(alias)}/raw`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Shared document</h1>
          <p className="text-sm opacity-80 break-all">
            Alias: <span className="font-mono">{alias}</span>
          </p>
        </div>

        <a
          href={rawUrl}
          className="rounded-md border px-3 py-2 text-sm hover:opacity-80"
        >
          Open / Download
        </a>
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <ShareForm alias={alias} docId={docId} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border">
        <iframe
          src={rawUrl}
          title={`doc:${alias}`}
          className="h-[80vh] w-full"
        />
      </div>
    </main>
  );
}
