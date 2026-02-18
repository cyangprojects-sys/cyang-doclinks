import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DebugDB() {
    const result = await sql`select current_database() as db, current_user as user, now() as time`;

    const alias = await sql`
    select alias, doc_id
    from public.doc_aliases
    where alias = 'hsds'
  `;

    return (
        <pre style={{ padding: 20 }}>
            {JSON.stringify({ result, alias }, null, 2)}
        </pre>
    );
}
