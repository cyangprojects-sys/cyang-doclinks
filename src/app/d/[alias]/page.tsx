import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import ShareForm from "./ShareForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AliasRow = {
  doc_id: string;
};

export default async function SharePage({
  params,
}: {
  params: { alias: string };
}) {
  // Prevent cached 404s / cached alias misses
  noStore();

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

  // ShareForm currently expects only { docId: string }
  return <ShareForm docId={docId} />;
}
