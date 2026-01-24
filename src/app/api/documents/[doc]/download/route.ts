import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { requireDocSession } from "@/lib/auth"; // you likely have something similar
import { signR2UrlFromPointer } from "@/lib/r2"; // your existing signer
import { getClientIp } from "@/lib/net"; // optional helper (can stub for now)

type DocRow = {
  id: string;
  target_url: string; // contains r2://bucket/key
  is_active?: boolean;
};

type GrantRow = {
  id: number;
  doc_id: string;
  is_active: boolean;
  revoked_at: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { doc: string } }
) {
  const docId = (params.doc || "").trim();
  if (!docId) return new Response("Bad request", { status: 400 });

  // 1) validate session cookie (cy_doc_session)
  const session = await requireDocSession(req); 
  // session should include email + maybe grant_id(s)

  // 2) enforce DB grant (doc_access_grants)
  //    Adjust to match your schema: either by (doc_id + email) or by session.grant_id
  const grants = await sql<GrantRow[]>`
    select id, doc_id, is_active, revoked_at
    from doc_access_grants
    where doc_id = ${docId}
      and is_active = true
      and revoked_at is null
      and email = ${session.email}
    limit 1
  `;

  if (!grants.length) return new Response("Forbidden", { status: 403 });

  // 3) fetch doc pointer
  const docs = await sql<DocRow[]>`
    select id, target_url
    from documents
    where id = ${docId}
    limit 1
  `;
  if (!docs.length) return new Response("Not found", { status: 404 });

  const pointer = docs[0].target_url || "";
  if (!pointer.startsWith("r2://")) {
    return new Response("Invalid target", { status: 500 });
  }

  // 4) sign short-lived private URL and redirect
  //    Keep TTL short (e.g., 60–300s)
  const signedUrl = await signR2UrlFromPointer(pointer, {
    expiresInSeconds: 120,
    disposition: "inline", // or "attachment"
  });

  return Response.redirect(signedUrl, 302);
}
