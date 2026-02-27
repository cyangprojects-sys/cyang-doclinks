// src/app/d/[alias]/raw/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { resolveDoc } from "@/lib/resolveDoc";
import { sql } from "@/lib/db";
import { aliasTrustCookieName, isAliasTrusted } from "@/lib/deviceTrust";
import { rateLimit, rateLimitHeaders, stableHash } from "@/lib/rateLimit";
import { mintAccessTicket } from "@/lib/accessTicket";
import { assertCanServeView, incrementMonthlyViews } from "@/lib/monetization";
import { enforcePlanLimitsEnabled } from "@/lib/billingFlags";
import { clientIpKey, detectAliasAccessDeniedSpike, logDbErrorEvent, logSecurityEvent } from "@/lib/securityTelemetry";
import crypto from "crypto";
import { isAliasServingDisabled, isSecurityTestNoDbMode } from "@/lib/securityPolicy";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

function normAlias(alias: string): string {
  return decodeURIComponent(String(alias || "")).trim().toLowerCase();
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= Date.now();
}


function hashIp(ip: string) {
  const salt = (process.env.VIEW_SALT || "").trim();
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function shouldCountView(req: NextRequest): boolean {
  // Avoid burning views on Range/chunk fetches
  const range = req.headers.get("range") || "";
  return !range;
}

async function getAliasRow(aliasInput: string): Promise<
  | { ok: true; docId: string; revokedAt: string | null; expiresAt: string | null; passwordHash: string | null }
  | { ok: false }
> {
  const alias = normAlias(aliasInput);
  if (!alias) return { ok: false };

  // Preferred: doc_aliases
  try {
    const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        a.revoked_at::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.doc_aliases a
      where lower(a.alias) = ${alias}
        and coalesce(a.is_active, true) = true
      limit 1
    `) as unknown as Array<{
      doc_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      password_hash: string | null;
    }>;

    if (rows?.length) {
      const r = rows[0];
      return {
        ok: true,
        docId: r.doc_id,
        revokedAt: r.revoked_at ?? null,
        expiresAt: r.expires_at ?? null,
        passwordHash: r.password_hash ?? null,
      };
    }
  } catch {
    // fall through
  }

  // Legacy: document_aliases
  try {
    const rows = (await sql`
      select
        a.doc_id::text as doc_id,
        null::text as revoked_at,
        a.expires_at::text as expires_at,
        a.password_hash::text as password_hash
      from public.document_aliases a
      where lower(a.alias) = ${alias}
      limit 1
    `) as unknown as Array<{
      doc_id: string;
      revoked_at: string | null;
      expires_at: string | null;
      password_hash: string | null;
    }>;

    if (rows?.length) {
      const r = rows[0];
      return {
        ok: true,
        docId: r.doc_id,
        revokedAt: r.revoked_at ?? null,
        expiresAt: r.expires_at ?? null,
        passwordHash: r.password_hash ?? null,
      };
    }
  } catch {
    // ignore
  }

  return { ok: false };
}

function pickFilename(title: string | null, original: string | null, fallback: string) {
  const base = (title || original || fallback).trim() || fallback;
  return base.replace(/[^\w.\- ]+/g, "_");
}

function parseDisposition(req: NextRequest): "inline" | "attachment" {
  const url = new URL(req.url);
  const d = (url.searchParams.get("disposition") || url.searchParams.get("dl") || "").toLowerCase();
  if (d === "1" || d === "true" || d === "download" || d === "attachment") return "attachment";
  return "inline";
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ alias: string }> }
): Promise<Response> {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_ALIAS_RAW_MS", 25_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("alias_raw");

        if (isSecurityTestNoDbMode()) {
          return new Response("Not found", { status: 404 });
        }

    if (await isAliasServingDisabled()) {
      return new Response("Unavailable", { status: 503 });
    }

    const { alias: rawAlias } = await ctx.params;
    const alias = normAlias(rawAlias || "");
    const ip = clientIpKey(req).ip;
    const deny = async (reason: string, status = 404) => {
      await logSecurityEvent({
        type: "alias_access_denied",
        severity: status === 429 ? "medium" : "low",
        ip,
        scope: "alias_raw",
        message: "Alias raw access denied",
        meta: { alias, reason, status },
      });
      await detectAliasAccessDeniedSpike({ ip });
      return new Response(status === 429 ? "Too Many Requests" : "Not found", { status });
    };

    if (!alias) return new Response("Missing alias", { status: 400 });

    // Resolve alias row ourselves so we can enforce the device-trust cookie.
    const row = await getAliasRow(alias);
    if (!row.ok) return await deny("not_found");
    if (row.revokedAt) return await deny("revoked");
    if (isExpired(row.expiresAt)) return await deny("expired");

    if (row.passwordHash) {
      const v = req.cookies.get(aliasTrustCookieName(alias))?.value;
      const unlocked = isAliasTrusted(alias, v);
      if (!unlocked) {
        return new Response(null, {
          status: 302,
          headers: { Location: `/d/${encodeURIComponent(alias)}` },
        });
      }
    }

    // --- Rate limiting (best-effort) ---
    const xff = req.headers.get("x-forwarded-for") || "";
    const ipFromXff = xff.split(",")[0]?.trim() || "";
    const ipKey = stableHash(ipFromXff, "VIEW_SALT");
    const ipRl = await rateLimit({
      scope: "ip:alias_raw",
      id: ipKey,
      limit: Number(process.env.RATE_LIMIT_ALIAS_IP_PER_MIN || 90),
      windowSeconds: 60,
      failClosed: true,
    });
    if (!ipRl.ok) {
      await logSecurityEvent({
        type: "alias_access_denied",
        severity: "medium",
        ip,
        scope: "alias_raw",
        message: "Alias raw rate-limited",
        meta: { alias, reason: "rate_limit", status: 429 },
      });
      await detectAliasAccessDeniedSpike({ ip });
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          ...rateLimitHeaders(ipRl),
          "Retry-After": String(ipRl.resetSeconds),
        },
      });
    }

    const resolved = await resolveDoc({ alias });
    if (!resolved.ok) return await deny(`resolve_${resolved.error}`);

    if (!resolved.bucket || !resolved.r2Key) {
      return new Response("Not found", { status: 404 });
    }

    const filename = pickFilename(resolved.title, resolved.originalFilename, alias) + ".pdf";
    const contentType = resolved.contentType || "application/pdf";
    const disposition = parseDisposition(req);
// --- Monetization / plan limits (hidden) ---
// Enforce the document owner's monthly view quota.
if (shouldCountView(req)) {
  let ownerId: string | null = null;
  try {
    const ownerRows = (await sql`
        select owner_id::text as owner_id
        from public.docs
        where id = ${row.docId}::uuid
        limit 1
      `) as unknown as Array<{ owner_id: string | null }>;
    ownerId = ownerRows?.[0]?.owner_id ?? null;
  } catch {
    if (enforcePlanLimitsEnabled()) {
      return new Response("Temporarily unavailable", { status: 503 });
    }
    ownerId = null;
  }

  if (ownerId) {
    const allowed = await assertCanServeView(ownerId);
    if (!allowed.ok) {
      return new Response(allowed.message || "Plan limit reached. Upgrade required.", { status: 402 });
    }

    try {
      await incrementMonthlyViews(ownerId, 1);
    } catch {
      if (enforcePlanLimitsEnabled()) {
        return new Response("Temporarily unavailable", { status: 503 });
      }
    }
  }

  // Best-effort view log (analytics)
  try {
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "";
    const ipHash = hashIp(ip);

    try {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash, share_token, event_type)
        values
          (${row.docId}::uuid, ${alias}, ${new URL(req.url).pathname}, 'alias', ${ua}, ${ref}, ${ipHash}, null, ${disposition === "attachment" ? "file_download" : "preview_view"})
      `;
    } catch {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash)
        values
          (${row.docId}::uuid, ${alias}, ${new URL(req.url).pathname}, 'alias', ${ua}, ${ref}, ${ipHash})
      `;
    }
  } catch {
    // ignore
  }
}



    const ticketId = await mintAccessTicket({
      req,
      docId: row.docId,
      shareToken: null,
      alias,
      purpose: disposition === "attachment" ? "file_download" : "preview_view",
      r2Bucket: resolved.bucket,
      r2Key: resolved.r2Key,
      responseContentType: contentType,
      responseContentDisposition: `${disposition}; filename="${filename}"`,
    });

    if (!ticketId) {
      return new Response("Internal server error", {
        status: 500,
        headers: { ...rateLimitHeaders(ipRl) },
      });
    }

        return new Response(null, {
          status: 302,
          headers: {
            Location: new URL(`/t/${ticketId}`, req.url).toString(),
            ...rateLimitHeaders(ipRl),
            "Cache-Control": "private, no-store",
          },
        });
      })(),
      timeoutMs
    );
  } catch (err: any) {
    if (isRuntimeEnvError(err)) {
      return new Response("Unavailable", { status: 503 });
    }
    if (isRouteTimeoutError(err)) {
      await logSecurityEvent({
        type: "alias_raw_timeout",
        severity: "high",
        ip: clientIpKey(req).ip,
        scope: "alias_raw",
        message: "Alias raw route exceeded timeout",
        meta: { timeoutMs },
      });
      return new Response("Gateway Timeout", { status: 504 });
    }
    await logDbErrorEvent({
      scope: "alias_raw",
      message: String(err?.message || err || "alias_raw_error"),
      ip: clientIpKey(req).ip,
      meta: { route: "/d/[alias]/raw" },
    });
    console.error("RAW ROUTE ERROR:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
