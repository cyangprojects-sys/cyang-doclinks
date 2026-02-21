export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { emitWebhook } from "@/lib/webhooks";
import crypto from "crypto";

function newToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

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
  if (!docId) return NextResponse.json({ ok: false, error: "MISSING_DOC_ID" }, { status: 400 });

  // Ensure ownership
  const owns = (await sql`
    select 1
    from public.docs
    where id = ${docId}::uuid
      and owner_id = ${auth.ownerId}::uuid
    limit 1
  `) as unknown as Array<{ "?column?": number }>;
  if (!owns.length) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const toEmailRaw = String(body?.to_email || body?.toEmail || "").trim();
  const toEmail = toEmailRaw ? toEmailRaw.toLowerCase() : null;

  const expiresAtRaw = String(body?.expires_at || body?.expiresAt || "").trim();
  const expiresAt = expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw)) ? new Date(expiresAtRaw).toISOString() : null;

  const maxViewsRaw = body?.max_views ?? body?.maxViews;
  const maxViewsNum = maxViewsRaw === null || maxViewsRaw === undefined ? null : Number(maxViewsRaw);
  let maxViews: number | null = null;
  if (maxViewsNum !== null && Number.isFinite(maxViewsNum)) {
    maxViews = Math.max(0, Math.floor(maxViewsNum));
  }

  const passwordRaw = String(body?.password || "").trim();
  const passwordHash = passwordRaw ? await bcrypt.hash(passwordRaw, 12) : null;

  const token = newToken();
  await sql`
    insert into public.share_tokens (token, doc_id, to_email, expires_at, max_views, password_hash)
    values (${token}, ${docId}::uuid, ${toEmail}, ${expiresAt}, ${maxViews}, ${passwordHash})
  `;

  const base = (process.env.BASE_URL || process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/+$/, "");
  const url = `${base}/s/${token}`;

  emitWebhook("share.created", {
    token,
    doc_id: docId,
    to_email: toEmail,
    expires_at: expiresAt,
    max_views: maxViews,
    has_password: !!passwordHash,
    created_via: "api",
  });

  return NextResponse.json({ ok: true, token, url });
}
