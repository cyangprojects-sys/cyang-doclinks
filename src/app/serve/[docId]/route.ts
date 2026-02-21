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
  const { docId } = await ctx.params;
  const resolved = await resolveDoc({ docId });

  if (!resolved.ok) {
    return new Response("Not found", { status: 404 });
  }

  // --- Rate limiting (best-effort) ---
  // 1) Global IP throttling for the serve endpoint
  // 2) Optional token abuse protection if a share token is provided
  const url = new URL(req.url);
  const alias = url.searchParams.get("alias");
  const token = url.searchParams.get("token");
  const ip = getClientIpFromHeaders(req.headers) || "";
  const aliasParam = (alias || "").trim() || null;
  const tokenParam = (token || "").trim() || null;
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

  if (token) {
    const tokenRl = await rateLimit({
      scope: "token:serve",
      id: stableHash(String(token), "VIEW_SALT"),
      limit: Number(process.env.RATE_LIMIT_SERVE_TOKEN_PER_MIN || 240),
      windowSeconds: 60,
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

  // Audit log (best-effort)
  try {
    const userAgent = getUserAgentFromHeaders(req.headers);

    // 1) High-level audit trail (writes to doc_audit if present)
    await logDocAccess({
      docId: resolved.docId,
      alias: alias || null,
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
        values (${resolved.docId}::uuid, ${alias || null}, ${token || null}, ${ip || null}, ${userAgent || null})
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
    const aliasParam = url.searchParams.get("alias") || null;
    const tokenParam = url.searchParams.get("token") || null;

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
    shareToken: url.searchParams.get("token") || null,
    alias: url.searchParams.get("alias") || null,
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
}
