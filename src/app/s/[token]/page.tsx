import { sql } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type ShareRow = { doc_id: string };

export default async function SharedDocPage({
    params,
}: {
    params: { token: string };
}) {
    const token = params.token;

    const rows = (await sql`
    select doc_id::text as doc_id
    from doc_shares
    where token = ${token}::uuid
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `) as ShareRow[];

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
                <iframe
                    src={`/serve/${encodeURIComponent(docId)}`}
                    style={{ width: "100%", height: "80vh", border: 0 }}
                    title="Shared PDF"
                />
            </div>
        </div>
    );
}
