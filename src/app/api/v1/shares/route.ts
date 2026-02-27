export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { verifyApiKeyFromRequest } from "@/lib/apiAuth";
import { emitWebhook } from "@/lib/webhooks";
import { assertCanCreateShare, getPlanForUser, normalizeExpiresAtForPlan, normalizeMaxViewsForPlan } from "@/lib/monetization";
import crypto from "crypto";
import { clientIpKey, enforceGlobalApiRateLimit } from "@/lib/securityTelemetry";
import { appendImmutableAudit } from "@/lib/immutableAudit";

function newToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

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


// --- Monetization / plan limits (hidden) ---
const shareAllowed = await assertCanCreateShare(auth.ownerId);
if (!shareAllowed.ok) {
  return NextResponse.json({ ok: false, error: shareAllowed.error, message: shareAllowed.message }, { status: 403 });
}
const plan = await getPlanForUser(auth.ownerId);

  const toEmailRaw = String(body?.to_email || body?.toEmail || "").trim();
  const toEmail = toEmailRaw ? toEmailRaw.toLowerCase() : null;

  const expiresAtRaw = String(body?.expires_at || body?.expiresAt || "").trim();
  const expiresAt = expiresAtRaw && !Number.isNaN(Date.parse(expiresAtRaw)) ? new Date(expiresAtRaw).toISOString() : null;

  const normalizedExpiresAt = normalizeExpiresAtForPlan({ plan, requestedExpiresAtIso: expiresAt, defaultDaysIfNotAllowed: 14 });

  const maxViewsRaw = body?.max_views ?? body?.maxViews;
  const maxViewsNum = maxViewsRaw === null || maxViewsRaw === undefined ? null : Number(maxViewsRaw);
  const requestedMaxViews =
    maxViewsNum !== null && Number.isFinite(maxViewsNum) ? Math.max(0, Math.floor(maxViewsNum)) : null;
  const maxViews = normalizeMaxViewsForPlan({ plan, requestedMaxViews });

  const passwordRaw = String(body?.password || "").trim();
  const passwordHash = passwordRaw ? await bcrypt.hash(passwordRaw, 12) : null;

  const allowedCountriesRaw = body?.allowed_countries ?? body?.allowedCountries ?? null;
const blockedCountriesRaw = body?.blocked_countries ?? body?.blockedCountries ?? null;

const normCountries = (v: any): string[] | null => {
  if (v == null) return null;
  const arr = Array.isArray(v) ? v : String(v).split(/[,\s]+/g);
  const out = arr
    .map((x) => String(x || "").trim().toUpperCase())
    .filter((x) => /^[A-Z]{2}$/.test(x));
  return out.length ? out : [];
};

const allowedCountries = normCountries(allowedCountriesRaw);
const blockedCountries = normCountries(blockedCountriesRaw);

const watermarkEnabledRaw = body?.watermark_enabled ?? body?.watermarkEnabled ?? null;
const watermarkEnabled =
  watermarkEnabledRaw == null ? null : Boolean(watermarkEnabledRaw);

const watermarkTextRaw = String(body?.watermark_text ?? body?.watermarkText ?? "").trim();
const watermarkText = watermarkTextRaw ? watermarkTextRaw.slice(0, 400) : null;

const token = newToken();
  // Newer schema supports geo + watermark columns; fall back silently if not present.
try {
  await sql`
    insert into public.share_tokens
      (token, doc_id, to_email, expires_at, max_views, password_hash, allowed_countries, blocked_countries, watermark_enabled, watermark_text)
    values
      (${token}, ${docId}::uuid, ${toEmail}, ${normalizedExpiresAt}, ${maxViews}, ${passwordHash}, ${allowedCountries}, ${blockedCountries}, ${watermarkEnabled ?? false}, ${watermarkText})
  `;
} catch {
  await sql`
    insert into public.share_tokens (token, doc_id, to_email, expires_at, max_views, password_hash)
    values (${token}, ${docId}::uuid, ${toEmail}, ${normalizedExpiresAt}, ${maxViews}, ${passwordHash})
  `;
}

const base = (process.env.BASE_URL || process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/+$/, "");
  const url = `${base}/s/${token}`;

  emitWebhook("share.created", {
    token,
    doc_id: docId,
    to_email: toEmail,
    expires_at: normalizedExpiresAt,
    max_views: maxViews,
    has_password: !!passwordHash,
    created_via: "api",
  });

  await appendImmutableAudit({
    streamKey: `doc:${docId}`,
    action: "share.create",
    actorUserId: auth.ownerId,
    docId,
    subjectId: token,
    ipHash: ipInfo.ipHash,
    payload: {
      toEmail,
      expiresAt: normalizedExpiresAt,
      maxViews,
      hasPassword: Boolean(passwordHash),
      allowedCountries,
      blockedCountries,
      watermarkEnabled: watermarkEnabled ?? false,
      watermarkText: watermarkText ?? null,
      via: "api",
    },
  });

  return NextResponse.json({ ok: true, token, url });
}
