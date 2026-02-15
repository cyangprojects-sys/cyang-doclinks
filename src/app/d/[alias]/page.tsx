import { sql } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type AliasRow = {
  doc_id: string;
};

function normalizeAlias(input: string) {
  // Next route params are usually already decoded, but be defensive.
  try {
    return decodeURIComponent(input).trim();
  } catch {
    return (input ?? "").trim();
  }
}

export default async function AliasDocPage({
  params,
}: {
  params: { alias: string };
}) {
  const alias = normalizeAlias(params.alias);
  if (!alias) notFound();

  // IMPORTANT:
  // In Neon, your table lives in the `public` schema. If the DB `search_path` is not `public`,
  // querying `doc_aliases` without schema can return 0 rows (-> Next.js 404) even though the row exists.
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
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
        Shared document
      </h1>

      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          overflow: "hidden",
          minHeight: "80vh",
        }}
      >
        {/* IMPORTANT: load /raw so we can enforce expiry + log views there */}
        <iframe
          src={`/d/${encodeURIComponent(alias)}/raw`}
          style={{ width: "100%", height: "80vh", border: 0 }}
          title="Shared PDF"
        />
      </div>
    </div>
  );
}
