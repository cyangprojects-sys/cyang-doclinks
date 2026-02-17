export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import SharePanel from "./SharePanel";
import { requireOwner } from "@/lib/owner";
import type { ShareRow } from "./actions";

type PageProps = {
  params: { alias: string };
};

export default async function DocAliasOwnerPage({ params }: PageProps) {
  const alias = String(params.alias || "").trim();

  // Require owner (this page is owner controls)
  await requireOwner();

  if (!alias) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Missing alias</h1>
      </main>
    );
  }

  // Resolve alias -> doc
  const docRows = (await sql`
    select
      d.id::text as id,
      d.title::text as title,
      d.created_at::text as created_at
    from docs d
    join doc_aliases a on a.doc_id = d.id
    where a.alias = ${alias}
    limit 1
  `) as unknown as { id: string; title: string | null; created_at: string }[];

  if (!docRows || docRows.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-neutral-600">
          Alias <span className="font-mono">{alias}</span> was not found.
        </p>
      </main>
    );
  }

  const doc = docRows[0];

  // Load existing share tokens for this doc (optional)
  const shares = (await sql`
    select
      st.token::text as token,
      st.to_email::text as to_email,
      st.created_at::text as created_at,
      st.expires_at::text as expires_at,
      st.max_views::int as max_views,
      st.revoked_at::text as revoked_at,

      coalesce((
        select count(*)::int
        from doc_views dv
        where dv.token = st.token
      ), 0) as view_count,

      (
        select max(dv.viewed_at)::text
        from doc_views dv
        where dv.token = st.token
      ) as last_viewed_at

    from share_tokens st
    where st.doc_id = ${doc.id}::uuid
    order by st.created_at desc
  `) as unknown as ShareRow[];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">
          {doc.title || "Document"}
        </h1>
        <p className="text-sm text-neutral-600">
          Alias: <span className="font-mono">/d/{alias}</span>
        </p>
      </header>

      <SharePanel
        docId={doc.id}
        alias={alias}
        docTitle={doc.title ?? "Document"}
        initialShares={shares}
      />
    </main>
  );
}
