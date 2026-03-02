export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { emitWebhook } from "@/lib/webhooks";
import { clientIpKey, enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";

export async function POST(req: NextRequest) {
  const ipInfo = clientIpKey(req);
  const rl = await enforceGlobalApiRateLimit({
    req,
    scope: "ip:api",
    limit: Number(process.env.RATE_LIMIT_API_IP_PER_MIN || 240),
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMIT" },
      { status: rl.status, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const auth = await verifyApiKeyFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const docId = String(body?.doc_id || body?.docId || "").trim();
  const alias = String(body?.alias || "").trim();
  const expiresDaysRaw = Number(body?.expires_days ?? body?.expiresDays ?? process.env.ALIAS_DEFAULT_TTL_DAYS ?? 30);
  const expiresDays = Number.isFinite(expiresDaysRaw) ? Math.max(1, Math.min(365, Math.floor(expiresDaysRaw))) : 30;
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

  let created: Array<{ alias: string }> = [];
  try {
    created = (await sql`
      insert into public.doc_aliases (alias, doc_id, is_active, expires_at, revoked_at)
      values (${alias}, ${docId}::uuid, true, now() + (${expiresDays}::int * interval '1 day'), null)
      returning alias::text as alias
    `) as unknown as Array<{ alias: string }>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "");
    const missingCol =
      msg.includes("column") &&
      (msg.includes("expires_at") || msg.includes("revoked_at") || msg.includes("is_active"));
    if (missingCol) {
      created = (await sql`
        insert into public.doc_aliases (alias, doc_id)
        values (${alias}, ${docId}::uuid)
        returning alias::text as alias
      `) as unknown as Array<{ alias: string }>;
      if (!created.length) {
        return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, alias: created[0].alias, doc_id: docId });
    }
    if (typeof e === "object" && e !== null && "code" in e && String((e as { code?: string }).code || "") === "23505") {
      return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
    }
    throw e;
  }
  if (!created.length) {
    return NextResponse.json({ ok: false, error: "ALIAS_TAKEN" }, { status: 409 });
  }

  emitWebhook("alias.created", { alias, doc_id: docId, created_via: "api" });
  await appendImmutableAudit(
    {
      streamKey: `doc:${docId}`,
      action: "doc.alias_created",
      actorUserId: auth.ownerId,
      docId,
      subjectId: alias,
      ipHash: ipInfo.ipHash,
      payload: {
        alias,
        via: "api",
      },
    },
    { strict: true }
  );

  return NextResponse.json({ ok: true, alias, doc_id: docId });
}
