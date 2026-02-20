// src/app/serve/[docId]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { r2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { resolveDoc } from "@/lib/resolveDoc";
import { getClientIpFromHeaders, getUserAgentFromHeaders, logDocAccess } from "@/lib/audit";

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params;
  const resolved = await resolveDoc({ docId });

  if (!resolved.ok) {
    return new Response("Not found", { status: 404 });
  }

  // Audit log (best-effort)
  try {
    const url = new URL(req.url);
    const alias = url.searchParams.get("alias");
    const token = url.searchParams.get("token");

    const ip = getClientIpFromHeaders(req.headers);
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

    const url = new URL(req.url);
    const alias = url.searchParams.get("alias") || null;
    const token = url.searchParams.get("token") || null;

    // Try newer schema first (share_token + event_type). Fall back to legacy schema.
    try {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash, share_token, event_type)
        values
          (${resolved.docId}::uuid, ${alias}, ${url.pathname}, 'serve', ${ua}, ${ref}, ${ipHash}, ${token}, 'viewer_served')
      `;
    } catch {
      await sql`
        insert into public.doc_views
          (doc_id, alias, path, kind, user_agent, referer, ip_hash)
        values
          (${resolved.docId}::uuid, ${alias}, ${url.pathname}, 'serve', ${ua}, ${ref}, ${ipHash})
      `;
    }
  } catch {
    // ignore logging errors
  }

  const contentType = resolved.contentType || "application/pdf";
  const dispositionBase = safeName(resolved.title || resolved.originalFilename || "document");

  const url = await getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: resolved.bucket,
      Key: resolved.r2Key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename="${dispositionBase}.pdf"`,
    }),
    { expiresIn: 60 * 5 }
  );

  return Response.redirect(url, 302);
}
