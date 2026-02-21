export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { emitWebhook } from "@/lib/webhooks";

export async function POST(req: NextRequest) {
  const auth = await verifyApiKeyFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const docId = String(body?.doc_id || body?.docId || "").trim();
  const alias = String(body?.alias || "").trim();
  if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC_ID" }, { status: 400 });
  if (!alias) return NextResponse.json({ ok: false, error: "MISSING_ALIAS" }, { status: 400 });
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(alias)) {
    return NextResponse.json({ ok: false, error: "INVALID_ALIAS" }, { status: 400 });
  }

  const owns = (await sql`
    select 1
    from public.docs
    where id = ${docId}::uuid
      and owner_id = ${auth.ownerId}::uuid
    limit 1
  `) as unknown as Array<{ "?column?": number }>;
  if (!owns.length) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  await sql`
    insert into public.doc_aliases (alias, doc_id)
    values (${alias}, ${docId}::uuid)
    on conflict (alias)
    do update set doc_id = excluded.doc_id
  `;

  emitWebhook("alias.created", { alias, doc_id: docId, created_via: "api" });

  return NextResponse.json({ ok: true, alias, doc_id: docId });
}
