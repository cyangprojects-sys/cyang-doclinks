// src/app/serve/[docId]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { mintAccessTicket } from "@/lib/accessTicket";
import crypto from "crypto";
import { resolveDoc } from "@/lib/resolveDoc";
import { getClientIpFromHeaders, getUserAgentFromHeaders, logDocAccess } from "@/lib/audit";
import { rateLimit, rateLimitHeaders, stableHash } from "@/lib/rateLimit";
import { emitWebhook } from "@/lib/webhooks";
import { geoDecisionForRequest, getCountryFromHeaders } from "@/lib/geo";
import { assertCanServeView, incrementMonthlyViews } from "@/lib/monetization";
import { enforcePlanLimitsEnabled } from "@/lib/billingFlags";
import { getAuthedUser, roleAtLeast } from "@/lib/authz";
import { isGlobalServeDisabled, isSecurityTestNoDbMode } from "@/lib/securityPolicy";
import { getRouteTimeoutMs, isRouteTimeoutError, withRouteTimeout } from "@/lib/routeTimeout";
import { logSecurityEvent } from "@/lib/securityTelemetry";
import { assertRuntimeEnv, isRuntimeEnvError } from "@/lib/runtimeEnv";

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0]?.trim() || "";
}

function hashIp(ip: string) {
  const salt = process.env.VIEW_SALT || "";
  if (!salt || !ip) return null;
  return crypto.createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function safeName(name: string) {
  return (name || "document").replace(/[\r\n"]/g, " ").trim().slice(0, 120) || "document";
}

function parseDisposition(req: NextRequest): "inline" | "attachment" {
  const url = new URL(req.url);
  const d = (url.searchParams.get("disposition") || url.searchParams.get("dl") || "").toLowerCase();
  if (d === "1" || d === "true" || d === "download" || d === "attachment") return "attachment";
  return "inline";
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const timeoutMs = getRouteTimeoutMs("ROUTE_TIMEOUT_SERVE_MS", 25_000);
  try {
    return await withRouteTimeout(
      (async () => {
        assertRuntimeEnv("serve");

        if (isSecurityTestNoDbMode()) {
          return new Response("Not found", { status: 404 });
        }

  if (await isGlobalServeDisabled()) {
    return new Response("Unavailable", { status: 503 });
  }

  const { docId } = await ctx.params;
  const url = new URL(req.url);
  const aliasParam = (url.searchParams.get("alias") || "").trim() || null;
  const tokenParam = (url.searchParams.get("token") || "").trim() || null;

  let resolved;
  if (tokenParam) {
    resolved = await resolveDoc({ token: tokenParam });
  } else if (aliasParam) {
    resolved = await resolveDoc({ alias: aliasParam });
  } else {
    // Direct /serve/{docId} access is reserved for privileged first-party users.
    const u = await getAuthedUser();
    if (!u || !roleAtLeast(u.role, "admin")) {
      return new Response("Forbidden", { status: 403 });
    }
    resolved = await resolveDoc({ docId });
  }

  if (!resolved.ok) {
    if (resolved.error === "PASSWORD_REQUIRED") {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response("Not found", { status: 404 });
  }

  // Prevent docId path from becoming a standalone capability.
  if (resolved.docId !== docId) {
    return new Response("Not found", { status: 404 });
  }

  // --- Rate limiting (best-effort) ---
  // 1) Global IP throttling for the serve endpoint
  // 2) Optional token abuse protection if a share token is provided
  const ip = getClientIpFromHeaders(req.headers) || "";
  const ipHash = hashIp(ip);
  const dispositionForLog = parseDisposition(req);
  const ipKey = stableHash(ip, "VIEW_SALT");

  // --- Geo-based restriction (best-effort) ---
  const country = getCountryFromHeaders(req.headers);
  const geo = await geoDecisionForRequest({ country, docId, token: tokenParam });
  if (!geo.allowed) {
    return new Response("Forbidden", { status: 403 });
  }

  const ipRl = await rateLimit({
    scope: "ip:serve",
    id: ipKey,
    limit: Number(process.env.RATE_LIMIT_SERVE_IP_PER_MIN || 120),
    windowSeconds: 60,
    failClosed: true,
  });

  if (!ipRl.ok) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        ...rateLimitHeaders(ipRl),
        "Retry-After": String(ipRl.resetSeconds),
      },
    });
  }

  if (tokenParam) {
    const tokenRl = await rateLimit({
      scope: "token:serve",
      id: stableHash(String(tokenParam), "VIEW_SALT"),
      limit: Number(process.env.RATE_LIMIT_SERVE_TOKEN_PER_MIN || 240),
      windowSeconds: 60,
      failClosed: true,
    });
    if (!tokenRl.ok) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          ...rateLimitHeaders(tokenRl),
          "Retry-After": String(tokenRl.resetSeconds),
        },
      });
    }
  }

  // --- Monetization / plan limits (hidden) ---
  // Enforce the document owner's monthly view quota.
  try {
    const ownerRows = (await sql`
      select owner_id::text as owner_id
      from public.docs
      where id = ${resolved.docId}::uuid
      limit 1
    `) as unknown as Array<{ owner_id: string | null }>;
    const ownerId = ownerRows?.[0]?.owner_id ?? null;
    if (ownerId) {
      const allowed = await assertCanServeView(ownerId);
      if (!allowed.ok) {
        return new Response("Temporarily unavailable", { status: 429 });
      }
      await incrementMonthlyViews(ownerId, 1);
    }
  } catch {
    if (enforcePlanLimitsEnabled()) {
      return new Response("Temporarily unavailable", { status: 503 });
    }
  }

  // Audit log (best-effort)
  try {
    const userAgent = getUserAgentFromHeaders(req.headers);

    // 1) High-level audit trail (writes to doc_audit if present)
    await logDocAccess({
      docId: resolved.docId,
      alias: aliasParam,
      shareId: null,
      emailUsed: null,
      ip,
      userAgent,
    });

    // 2) Access logs (writes to doc_access_log with the schema we observed in prod)
    //    columns: id, doc_id, alias, token, ip, user_agent, created_at
    try {
      await sql`
        insert into public.doc_access_log (doc_id, alias, token, ip, user_agent)
        values (${resolved.docId}::uuid, ${aliasParam}, ${tokenParam}, ${ip || null}, ${userAgent || null})
      `;

      emitWebhook("doc.viewed", {
        docId: resolved.docId,
        alias: aliasParam ?? null,
        path: url.pathname,
        kind: "serve",
        ipHash,
        shareToken: tokenParam ?? null,
        eventType: dispositionForLog === "attachment" ? "file_download" : "preview_view",
      });
    } catch {
      // ignore (table may be missing or schema may differ)
    }
  } catch {
    // ignore
  }


  // Analytics (best-effort)
  try {
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = req.headers.get("user-agent") || null;
    const ref = req.headers.get("referer") || null;

    // Try newer schema first (share_token + event_type). Fall back to legacy schema.
    try {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash, share_token, event_type)
        values
          (${resolved.docId}::uuid, ${aliasParam}, ${url.pathname}, 'serve', ${ua}, ${ref}, ${ipHash}, ${tokenParam}, ${dispositionForLog === "attachment" ? "file_download" : "preview_view"})
      `;

      emitWebhook("doc.viewed", {
        docId: resolved.docId,
        alias: aliasParam ?? null,
        path: url.pathname,
        kind: "serve",
        ipHash,
        shareToken: tokenParam ?? null,
        eventType: dispositionForLog === "attachment" ? "file_download" : "preview_view",
      });
    } catch {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash)
        values
          (${resolved.docId}::uuid, ${aliasParam}, ${url.pathname}, 'serve', ${ua}, ${ref}, ${ipHash})
      `;
    }
  } catch {
    // ignore logging errors
  }

  const contentType = resolved.contentType || "application/pdf";
  const dispositionBase = safeName(resolved.title || resolved.originalFilename || "document");

  const disposition = parseDisposition(req);

  const ticketId = await mintAccessTicket({
    req,
    docId: resolved.docId,
    shareToken: tokenParam,
    alias: aliasParam,
    purpose: disposition === "attachment" ? "file_download" : "preview_view",
    r2Bucket: resolved.bucket,
    r2Key: resolved.r2Key,
    responseContentType: contentType,
    responseContentDisposition: `${disposition}; filename="${dispositionBase}.pdf"`,
  });

  if (!ticketId) {
    return new Response("Server error", {
      status: 500,
      headers: { ...rateLimitHeaders(ipRl) },
    });
  }

        return new Response(null, {
          status: 302,
          headers: {
            Location: new URL(`/t/${ticketId}`, req.url).toString(),
            ...rateLimitHeaders(ipRl),
          },
        });
      })(),
      timeoutMs
    );
  } catch (e: unknown) {
    if (isRuntimeEnvError(e)) {
      return new Response("Unavailable", { status: 503 });
    }
    if (isRouteTimeoutError(e)) {
      void logSecurityEvent({
        type: "serve_timeout",
        severity: "high",
        ip: getClientIpFromHeaders(req.headers) || null,
        scope: "serve",
        message: "Serve route exceeded timeout",
        meta: { timeoutMs },
      });
      return new Response("Gateway Timeout", { status: 504 });
    }
    throw e;
  }
}
